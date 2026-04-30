#!/usr/bin/env bash
# Build and deploy QMK Nexus to AWS.
#
# This script deploys the runtime pieces:
#   - backend FastAPI/Mangum app as an AWS Lambda container image
#   - frontend Vite app as an AWS Lambda container image
#
# It can also push the firmware builder image to ECR when requested.
#
# First-time AWS resource creation is handled by scripts/aws-setup.sh. This
# script assumes the Lambda functions and optional CloudFront
# distributions already exist.
#
# Required for the selected deploy targets:
#   Backend:  LAMBDA_NAME, API_ECR_REPOSITORY
#   Frontend: FRONTEND_LAMBDA_NAME, FRONTEND_ECR_REPOSITORY
#   Builder:  BUILDER_ECR_REPOSITORY
#
# Common optional environment variables:
#   AWS_REGION=us-east-1
#   AWS_ACCOUNT_ID=123456789012
#   DOMAIN=qmknexus.tebay.dev
#   BACKEND_DOMAIN=qmknexus-back.tebay.dev
#   FRONTEND_LAMBDA_NAME=qmk-nexus-frontend
#   FRONTEND_ECR_REPOSITORY=qmk-nexus-frontend
#   FRONTEND_IMAGE_TAG=latest
#   CF_DIST_ID=E123...
#   BACKEND_CF_DIST_ID=E456...
#   VITE_API_URL=https://qmknexus-back.tebay.dev
#   API_ECR_REPOSITORY=qmk-nexus-api
#   API_IMAGE_TAG=latest
#   LAMBDA_FUNCTION=qmk-nexus-api
#   ECR_REPO=qmk-nexus-api
#   IMAGE_TAG=latest
#   BUILDER_ECR_REPOSITORY=qmk-nexus-builder
#   BUILDER_IMAGE_TAG=latest
#   AWS_PROFILE=profile-name
#
# Examples:
#   ./scripts/deploy_aws.sh --all
#   ./scripts/deploy_aws.sh --backend --lambda-name qmk-nexus-api
#   ./scripts/deploy_aws.sh --backend --repo qmk-nexus-api --function qmk-nexus-api --tag latest
#   ./scripts/deploy_aws.sh --frontend --frontend-function qmk-nexus-frontend --frontend-repo qmk-nexus-frontend --cf-dist-id E123
#   ./scripts/deploy_aws.sh --builder --builder-ecr-repository qmk-nexus-builder
#   ./scripts/deploy_aws.sh --builder --builder-ecr-repository 123456789012.dkr.ecr.us-east-1.amazonaws.com/qmk-nexus-builder

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
DOMAIN="${DOMAIN:-qmknexus.tebay.dev}"
BACKEND_DOMAIN="${BACKEND_DOMAIN:-qmknexus-back.tebay.dev}"
LAMBDA_NAME="${LAMBDA_NAME:-${LAMBDA_FUNCTION:-qmk-nexus-api}}"
FRONTEND_LAMBDA_NAME="${FRONTEND_LAMBDA_NAME:-${FRONTEND_LAMBDA_FUNCTION:-qmk-nexus-frontend}}"
CF_DIST_ID="${CF_DIST_ID:-}"
BACKEND_CF_DIST_ID="${BACKEND_CF_DIST_ID:-}"
API_ECR_REPOSITORY="${API_ECR_REPOSITORY:-${ECR_REPO:-qmk-nexus-api}}"
API_IMAGE_TAG="${API_IMAGE_TAG:-${IMAGE_TAG:-latest}}"
FRONTEND_ECR_REPOSITORY="${FRONTEND_ECR_REPOSITORY:-qmk-nexus-frontend}"
FRONTEND_IMAGE_TAG="${FRONTEND_IMAGE_TAG:-latest}"
BUILDER_ECR_REPOSITORY="${BUILDER_ECR_REPOSITORY:-${ECR_REPOSITORY:-qmk-nexus-builder}}"
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
      DEPLOY_BUILDER=1
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
    --account-id)
      AWS_ACCOUNT_ID="$2"
      shift 2
      ;;
    --lambda-name|--function)
      LAMBDA_NAME="$2"
      shift 2
      ;;
    --frontend-function|--frontend-lambda-name)
      FRONTEND_LAMBDA_NAME="$2"
      shift 2
      ;;
    --frontend-repo|--frontend-ecr-repository)
      FRONTEND_ECR_REPOSITORY="$2"
      shift 2
      ;;
    --frontend-image-tag)
      FRONTEND_IMAGE_TAG="$2"
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
    --api-ecr-repository|--repo)
      API_ECR_REPOSITORY="$2"
      shift 2
      ;;
    --api-image-tag|--tag)
      API_IMAGE_TAG="$2"
      shift 2
      ;;
    --builder-ecr-repository|--ecr-repository)
      BUILDER_ECR_REPOSITORY="$2"
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
  DEPLOY_BUILDER=1
fi

aws_args=(--region "$AWS_REGION")

account_id() {
  if [[ -n "$AWS_ACCOUNT_ID" ]]; then
    printf '%s' "$AWS_ACCOUNT_ID"
    return
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '123456789012'
    return
  fi
  aws "${aws_args[@]}" sts get-caller-identity --query Account --output text
}

ecr_image_uri() {
  local repository="$1"
  local tag="$2"
  local registry account
  if [[ "$repository" == *.dkr.ecr.*.amazonaws.com/* ]]; then
    printf '%s:%s' "$repository" "$tag"
  else
    account="$(account_id)"
    registry="${account}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    printf '%s/%s:%s' "$registry" "$repository" "$tag"
  fi
}

ecr_registry_from_image() {
  local image_uri="$1"
  printf '%s' "${image_uri%%/*}"
}

ecr_repository_name_from_image() {
  local image_uri="$1"
  local without_registry="${image_uri#*/}"
  printf '%s' "${without_registry%%:*}"
}

ensure_ecr_repository() {
  local image_uri="$1"
  local repository
  repository="$(ecr_repository_name_from_image "$image_uri")"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "dry-run: ensure ECR repository exists: $repository"
    return
  fi
  if ! aws "${aws_args[@]}" ecr describe-repositories --repository-names "$repository" >/dev/null 2>&1; then
    aws "${aws_args[@]}" ecr create-repository --repository-name "$repository" >/dev/null
    info "Created ECR repository: $repository"
  fi
}

ecr_login() {
  local registry="$1"
  log "Logging in to ECR"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "dry-run: aws ecr get-login-password ... | podman login --username AWS --password-stdin ${registry}"
  else
    aws "${aws_args[@]}" ecr get-login-password \
      | podman login --username AWS --password-stdin "$registry"
  fi
}

deploy_backend() {
  need_command aws
  need_command podman
  [[ -n "$LAMBDA_NAME" ]] || die "LAMBDA_NAME or --lambda-name is required for backend deploy"
  [[ -n "$API_ECR_REPOSITORY" ]] || die "API_ECR_REPOSITORY or --api-ecr-repository is required for backend deploy"

  local image_uri registry package_type
  image_uri="$(ecr_image_uri "$API_ECR_REPOSITORY" "$API_IMAGE_TAG")"
  registry="$(ecr_registry_from_image "$image_uri")"

  log "Building backend Lambda image"
  ensure_ecr_repository "$image_uri"
  run podman build --platform linux/amd64 -f "$ROOT/docker/backend/Dockerfile.lambda" -t "$image_uri" "$ROOT"
  ecr_login "$registry"

  log "Pushing backend Lambda image"
  run podman push "$image_uri"
  info "Backend image: $image_uri"

  log "Deploying backend Lambda"
  if [[ "$DRY_RUN" == "0" ]]; then
    package_type="$(aws "${aws_args[@]}" lambda get-function-configuration \
      --function-name "$LAMBDA_NAME" \
      --query 'PackageType' \
      --output text 2>/dev/null || true)"
    if [[ "$package_type" == "Zip" ]]; then
      die "Lambda $LAMBDA_NAME is PackageType=Zip. Create a new image-package Lambda with scripts/aws-setup.sh --create-lambda --lambda-image-uri $image_uri, or delete/recreate it."
    fi
  fi
  run aws "${aws_args[@]}" lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --image-uri "$image_uri" \
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

deploy_frontend() {
  need_command aws
  need_command podman
  [[ -n "$FRONTEND_LAMBDA_NAME" ]] || die "FRONTEND_LAMBDA_NAME or --frontend-function is required for frontend deploy"
  [[ -n "$FRONTEND_ECR_REPOSITORY" ]] || die "FRONTEND_ECR_REPOSITORY or --frontend-repo is required for frontend deploy"

  local image_uri registry package_type
  image_uri="$(ecr_image_uri "$FRONTEND_ECR_REPOSITORY" "$FRONTEND_IMAGE_TAG")"
  registry="$(ecr_registry_from_image "$image_uri")"

  log "Building frontend Lambda image"
  ensure_ecr_repository "$image_uri"
  if [[ "$SKIP_BUILD" == "0" ]]; then
    run podman build --platform linux/amd64 -f "$ROOT/docker/frontend/Dockerfile.lambda" -t "$image_uri" "$ROOT"
  else
    info "Skipping frontend image build"
  fi
  ecr_login "$registry"

  log "Pushing frontend Lambda image"
  run podman push "$image_uri"
  info "Frontend image: $image_uri"

  log "Deploying frontend Lambda"
  if [[ "$DRY_RUN" == "0" ]]; then
    package_type="$(aws "${aws_args[@]}" lambda get-function-configuration \
      --function-name "$FRONTEND_LAMBDA_NAME" \
      --query 'PackageType' \
      --output text 2>/dev/null || true)"
    if [[ "$package_type" == "Zip" ]]; then
      die "Lambda $FRONTEND_LAMBDA_NAME is PackageType=Zip. Create a new image-package Lambda with scripts/aws-setup.sh --create-frontend-lambda --frontend-lambda-image-uri $image_uri, or delete/recreate it."
    fi
  fi
  run aws "${aws_args[@]}" lambda update-function-code \
    --function-name "$FRONTEND_LAMBDA_NAME" \
    --image-uri "$image_uri" \
    --query 'FunctionArn' \
    --output text

  if [[ "$DRY_RUN" == "0" ]]; then
    info "Waiting for frontend Lambda code update to finish"
    aws "${aws_args[@]}" lambda wait function-updated --function-name "$FRONTEND_LAMBDA_NAME"
  fi

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
  [[ -n "$BUILDER_ECR_REPOSITORY" ]] || die "BUILDER_ECR_REPOSITORY or --builder-ecr-repository is required for builder deploy"

  local registry image_uri
  image_uri="$(ecr_image_uri "$BUILDER_ECR_REPOSITORY" "$BUILDER_IMAGE_TAG")"
  registry="$(ecr_registry_from_image "$image_uri")"

  log "Building firmware builder image"
  ensure_ecr_repository "$image_uri"
  run podman build -t "$image_uri" "$ROOT/docker/builder"

  ecr_login "$registry"

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
