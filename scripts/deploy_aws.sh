#!/usr/bin/env bash
# Build and deploy QMK Nexus to AWS.
#
# This script deploys the two runtime pieces:
#   - backend FastAPI/Mangum app as an AWS Lambda zip
#   - frontend Vite build to an S3 static hosting bucket
#
# It can also push the firmware builder image to ECR when requested.
#
# First-time AWS resource creation is handled by scripts/aws-setup.sh. This
# script assumes the Lambda, frontend bucket, and optional CloudFront
# distributions already exist.
#
# Required for the selected deploy targets:
#   Backend:  LAMBDA_NAME
#   Frontend: FRONTEND_BUCKET
#   Builder:  ECR_REPOSITORY
#
# Common optional environment variables:
#   AWS_REGION=us-east-1
#   DOMAIN=qmknexus.tebay.dev
#   BACKEND_DOMAIN=qmknexus-back.tebay.dev
#   CF_DIST_ID=E123...
#   BACKEND_CF_DIST_ID=E456...
#   VITE_API_URL=https://qmknexus-back.tebay.dev
#   AWS_PROFILE=profile-name
#
# Examples:
#   ./deploy_aws.sh --all
#   ./deploy_aws.sh --backend --lambda-name qmk-nexus-api
#   ./deploy_aws.sh --frontend --frontend-bucket qmk-nexus-frontend --cf-dist-id E123
#   ./deploy_aws.sh --builder --ecr-repository qmk-nexus-builder
#   ./deploy_aws.sh --builder --ecr-repository 123456789012.dkr.ecr.us-east-1.amazonaws.com/qmk-nexus-builder

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_ROOT="${BUILD_ROOT:-${ROOT}/.aws-build}"
LAMBDA_BUILD_DIR="${BUILD_ROOT}/lambda"
LAMBDA_ZIP="${BUILD_ROOT}/qmk-nexus-api.zip"

AWS_REGION="${AWS_REGION:-us-east-1}"
DOMAIN="${DOMAIN:-qmknexus.tebay.dev}"
BACKEND_DOMAIN="${BACKEND_DOMAIN:-qmknexus-back.tebay.dev}"
LAMBDA_NAME="${LAMBDA_NAME:-qmk-nexus-api}"
FRONTEND_BUCKET="${FRONTEND_BUCKET:-}"
CF_DIST_ID="${CF_DIST_ID:-}"
BACKEND_CF_DIST_ID="${BACKEND_CF_DIST_ID:-}"
ECR_REPOSITORY="${ECR_REPOSITORY:-}"
BUILDER_IMAGE_TAG="${BUILDER_IMAGE_TAG:-latest}"
VITE_API_URL="${VITE_API_URL:-https://${BACKEND_DOMAIN}}"

DEPLOY_BACKEND=0
DEPLOY_FRONTEND=0
DEPLOY_BUILDER=0
SKIP_BUILD=0
DRY_RUN=0

usage() {
  sed -n '/^# Build and deploy/,/^set -euo pipefail/p' "$0" \
    | sed '/^set -euo pipefail/d; s/^# \{0,1\}//'
}

log() {
  printf '\n==> %s\n' "$*"
}

info() {
  printf '    %s\n' "$*"
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '    dry-run:'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --all)
      DEPLOY_BACKEND=1
      DEPLOY_FRONTEND=1
      shift
      ;;
    --backend)
      DEPLOY_BACKEND=1
      shift
      ;;
    --frontend)
      DEPLOY_FRONTEND=1
      shift
      ;;
    --builder)
      DEPLOY_BUILDER=1
      shift
      ;;
    --region)
      AWS_REGION="$2"
      shift 2
      ;;
    --lambda-name)
      LAMBDA_NAME="$2"
      shift 2
      ;;
    --frontend-bucket)
      FRONTEND_BUCKET="$2"
      shift 2
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --backend-domain)
      BACKEND_DOMAIN="$2"
      VITE_API_URL="https://${BACKEND_DOMAIN}"
      shift 2
      ;;
    --vite-api-url)
      VITE_API_URL="$2"
      shift 2
      ;;
    --cf-dist-id)
      CF_DIST_ID="$2"
      shift 2
      ;;
    --backend-cf-dist-id)
      BACKEND_CF_DIST_ID="$2"
      shift 2
      ;;
    --ecr-repository)
      ECR_REPOSITORY="$2"
      shift 2
      ;;
    --builder-image-tag)
      BUILDER_IMAGE_TAG="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

if [[ "$DEPLOY_BACKEND" == "0" && "$DEPLOY_FRONTEND" == "0" && "$DEPLOY_BUILDER" == "0" ]]; then
  DEPLOY_BACKEND=1
  DEPLOY_FRONTEND=1
fi

aws_args=(--region "$AWS_REGION")

account_id() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '123456789012'
    return
  fi
  aws "${aws_args[@]}" sts get-caller-identity --query Account --output text
}

package_backend() {
  need_command python3
  need_command rsync
  need_command zip

  log "Packaging backend Lambda"
  run rm -rf "$LAMBDA_BUILD_DIR" "$LAMBDA_ZIP"
  run mkdir -p "$LAMBDA_BUILD_DIR"

  if [[ "$SKIP_BUILD" == "0" ]]; then
    run python3 -m pip install \
      --quiet \
      --upgrade \
      --platform manylinux2014_x86_64 \
      --implementation cp \
      --python-version 3.12 \
      --only-binary=:all: \
      --target "$LAMBDA_BUILD_DIR" \
      -r "$ROOT/backend/requirements.txt"
  fi

  run rsync -a \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.env' \
    --exclude '.pytest_cache' \
    "$ROOT/backend/" "$LAMBDA_BUILD_DIR/"

  if [[ "$DRY_RUN" == "1" ]]; then
    run zip -qr "$LAMBDA_ZIP" .
  else
    (cd "$LAMBDA_BUILD_DIR" && zip -qr "$LAMBDA_ZIP" .)
  fi
  info "Lambda zip: $LAMBDA_ZIP"
}

deploy_backend() {
  need_command aws
  [[ -n "$LAMBDA_NAME" ]] || die "LAMBDA_NAME or --lambda-name is required for backend deploy"

  package_backend

  log "Deploying backend Lambda"
  run aws "${aws_args[@]}" lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --zip-file "fileb://${LAMBDA_ZIP}" \
    --query 'FunctionArn' \
    --output text

  if [[ "$DRY_RUN" == "0" ]]; then
    info "Waiting for Lambda code update to finish"
    aws "${aws_args[@]}" lambda wait function-updated --function-name "$LAMBDA_NAME"
  fi

  if [[ -n "$BACKEND_CF_DIST_ID" ]]; then
    invalidate_cloudfront "$BACKEND_CF_DIST_ID" '/*'
  fi
}

build_frontend() {
  need_command npm

  log "Building frontend"
  if [[ "$SKIP_BUILD" == "0" ]]; then
    run npm --prefix "$ROOT/frontend" ci --no-audit --no-fund
    run env "VITE_API_URL=${VITE_API_URL}" npm --prefix "$ROOT/frontend" run build
  else
    [[ -d "$ROOT/frontend/dist" ]] || die "frontend/dist does not exist; remove --skip-build"
    info "Using existing frontend/dist"
  fi
}

deploy_frontend() {
  need_command aws
  [[ -n "$FRONTEND_BUCKET" ]] || die "FRONTEND_BUCKET or --frontend-bucket is required for frontend deploy"

  build_frontend

  log "Syncing frontend to S3"
  run aws "${aws_args[@]}" s3 sync "$ROOT/frontend/dist/" "s3://${FRONTEND_BUCKET}/" \
    --delete \
    --cache-control 'public,max-age=31536000,immutable' \
    --exclude 'index.html'
  run aws "${aws_args[@]}" s3 cp "$ROOT/frontend/dist/index.html" "s3://${FRONTEND_BUCKET}/index.html" \
    --cache-control 'no-cache,no-store,must-revalidate' \
    --content-type 'text/html'

  if [[ -n "$CF_DIST_ID" ]]; then
    invalidate_cloudfront "$CF_DIST_ID" '/*'
  fi
}

invalidate_cloudfront() {
  local dist_id="$1"
  local path="$2"

  log "Invalidating CloudFront ${dist_id}"
  run aws cloudfront create-invalidation \
    --distribution-id "$dist_id" \
    --paths "$path" \
    --query 'Invalidation.Id' \
    --output text
}

deploy_builder() {
  need_command aws
  need_command podman
  [[ -n "$ECR_REPOSITORY" ]] || die "ECR_REPOSITORY or --ecr-repository is required for builder deploy"

  local registry image_uri account
  if [[ "$ECR_REPOSITORY" == *.dkr.ecr.*.amazonaws.com/* ]]; then
    registry="${ECR_REPOSITORY%%/*}"
    image_uri="${ECR_REPOSITORY}:${BUILDER_IMAGE_TAG}"
  else
    account="$(account_id)"
    registry="${account}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    image_uri="${registry}/${ECR_REPOSITORY}:${BUILDER_IMAGE_TAG}"
  fi

  log "Building firmware builder image"
  run podman build -t "$image_uri" "$ROOT/docker/builder"

  log "Logging in to ECR"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "dry-run: aws ecr get-login-password ... | podman login --username AWS --password-stdin ${registry}"
  else
    aws "${aws_args[@]}" ecr get-login-password \
      | podman login --username AWS --password-stdin "$registry"
  fi

  log "Pushing builder image"
  run podman push "$image_uri"
  info "Builder image: $image_uri"
  info "Register or update the ECS task definition to use this image."
}

need_command aws

if [[ "$DEPLOY_BACKEND" == "1" ]]; then
  deploy_backend
fi

if [[ "$DEPLOY_FRONTEND" == "1" ]]; then
  deploy_frontend
fi

if [[ "$DEPLOY_BUILDER" == "1" ]]; then
  deploy_builder
fi

log "Deploy complete"
