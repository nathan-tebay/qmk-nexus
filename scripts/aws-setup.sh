#!/usr/bin/env bash
# aws-setup.sh — create and wire AWS resources for qmknexus.tebay.dev.
#
# What this script does:
#   1. Optionally creates the IAM execution role named in --principal.
#   2. Creates (or updates) a least-privilege IAM managed policy covering S3,
#      DynamoDB, and CloudWatch Logs, then attaches it.
#   3. Optionally creates the S3 bucket and configures CORS + public-access block.
#   4. Optionally creates the DynamoDB build/refresh-token tables and enables TTL.
#   5. Optionally creates private VPC endpoints for Fargate build tasks.
#   6. Optionally creates backend/frontend Lambda functions from container images.
#   7. Optionally creates or updates Lambda Function URLs and wires them as
#      CloudFront origins.
#   8. Optionally writes key variables to your shell rc file.
#
# Usage:
#   ./scripts/aws-setup.sh \
#     --account-id 123456789012 \
#     --bucket qmk-nexus-prod \
#     --principal arn:aws:iam::123456789012:role/qmk-nexus-lambda \
#     [--region us-east-1] \
#     [--policy-name qmk-nexus-lambda-policy] \
#     [--create-role [--trust lambda.amazonaws.com]] \
#     [--create-bucket] \
#     [--create-dynamodb] \
#     [--lambda-name qmk-nexus-api] \
#     [--lambda-image-uri 123456789012.dkr.ecr.us-east-1.amazonaws.com/qmk-nexus-api:latest] \
#     [--create-lambda] \
#     [--frontend-lambda-name qmk-nexus-frontend] \
#     [--frontend-lambda-image-uri 123456789012.dkr.ecr.us-east-1.amazonaws.com/qmk-nexus-frontend:latest] \
#     [--create-frontend-lambda] \
#     [--cf-dist-id EXXXXXXXXXX] \
#     [--backend-cf-dist-id EXXXXXXXXXX] \
#     [--create-cf --cert-arn arn:aws:acm:...] \
#     [--create-cf-without-aliases] \
#     [--domain qmknexus.tebay.dev] \
#     [--backend-domain qmknexus-back.tebay.dev] \
#     [--build-domain qmknexus-build.tebay.dev] \
#     [--ecs-cluster qmk-nexus-builds] \
#     [--ecs-task-definition qmk-nexus-builder:1] \
#     [--ecs-task-role arn:aws:iam::123456789012:role/qmk-nexus-builder-task] \
#     [--ecs-execution-role arn:aws:iam::123456789012:role/qmk-nexus-builder-execution] \
#     [--ecs-subnets subnet-aaa,subnet-bbb] \
#     [--ecs-security-groups sg-abc123] \
#     [--create-vpc-endpoints --vpc-id vpc-abc123 --route-table-ids rtb-aaa,rtb-bbb] \
#     [--save-env] \
#     [--dry-run]
#
# Required parameters:
#   --account-id   Your 12-digit AWS account ID.
#   --bucket       S3 bucket name for per-user SQLite databases.
#   --principal    Full IAM ARN of the Lambda execution role.
#                  Must contain ':role/'.
#
# Optional parameters:
#   --region       AWS region (default: us-east-1).
#   --policy-name  IAM managed policy name (default: qmk-nexus-lambda-policy).
#   --create-role  Create the IAM role named in --principal before attaching
#                  policies. Trust defaults to lambda.amazonaws.com.
#   --trust        Service or ARN allowed to assume the role (default: lambda.amazonaws.com).
#   --create-bucket
#                  Create the S3 bucket, enable versioning, block all public
#                  access, and apply a CORS configuration suitable for the
#                  frontend/API domains.
#   --create-dynamodb
#                  Create qmk-nexus-builds and qmk-nexus-refresh as on-demand
#                  DynamoDB tables and enable TTL on their ttl attribute.
#   --lambda-name  Name of the Lambda function (default: qmk-nexus-api).
#   --lambda-image-uri
#                  ECR image URI for the backend Lambda container image.
#                  Required when --create-lambda is set.
#   --create-lambda
#                  Create the Lambda function from --lambda-image-uri.  If the
#                  image-package function already exists the code is updated
#                  in-place.
#                  Attaches the execution role and sets ENVIRONMENT=production.
#   --frontend-lambda-name
#                  Name of the frontend Lambda function (default:
#                  qmk-nexus-frontend).
#   --frontend-lambda-image-uri
#                  ECR image URI for the frontend Lambda container image.
#                  Required when --create-frontend-lambda is set.
#   --create-frontend-lambda
#                  Create/update the frontend Lambda function and Function URL.
#   --cf-dist-id   Existing CloudFront distribution ID.  When set without
#                  --create-cf, the script adds the Lambda Function URL as
#                  an origin and wires a /api/* cache behavior.
#   --backend-cf-dist-id
#                  Existing CloudFront distribution ID for --backend-domain.
#                  When set, its default origin is updated to the Lambda
#                  Function URL.
#   --create-cf    Create new CloudFront distributions for the frontend and
#                  backend Lambda Function URLs. Requires --cert-arn.
#   --create-cf-without-aliases
#                  Create distributions without alternate domain names first.
#                  Use this when DNS currently points the desired hostnames at
#                  another CloudFront distribution.
#   --cert-arn     ACM certificate ARN (must be in us-east-1) for --domain.
#   --domain       Custom domain for the CloudFront distribution.
#                  (default: qmknexus.tebay.dev)
#   --backend-domain
#                  Public API hostname used by the frontend and OAuth callback.
#                  (default: qmknexus-back.tebay.dev)
#   --build-domain Public build service hostname used by the API.
#                  (default: qmknexus-build.tebay.dev)
#   --ecs-cluster  ECS cluster used for firmware build tasks.
#   --ecs-task-definition
#                  ECS task definition ARN/family[:revision] for the builder image.
#   --ecs-container-name
#                  Container name inside the task definition (default: qmk-nexus-builder).
#   --ecs-task-role
#                  IAM task role ARN used by the builder container. When set,
#                  the script attaches S3 build-prefix access to this role.
#   --ecs-execution-role
#                  IAM execution role ARN used by ECS to pull the image/write logs.
#                  When set, Lambda PassRole is scoped to this plus --ecs-task-role.
#   --ecs-subnets  Comma-separated subnet IDs for Fargate awsvpc networking.
#   --ecs-security-groups
#                  Comma-separated security group IDs for Fargate tasks.
#   --ecs-assign-public-ip
#                  ENABLED or DISABLED for Fargate awsvpc networking.
#   --builder-task-policy-name
#                  IAM managed policy name attached to --ecs-task-role.
#   --builder-qmk-commit
#                  QMK commit baked into the deployed builder image. Defaults
#                  to backend/data/qmk_meta.json when present.
#   --create-vpc-endpoints
#                  Create cost-control endpoints so private Fargate tasks can
#                  reach S3, ECR, and CloudWatch Logs without a NAT gateway.
#   --vpc-id       VPC ID for --create-vpc-endpoints.
#   --route-table-ids
#                  Comma-separated private route table IDs for the S3 gateway endpoint.
#   --endpoint-security-groups
#                  Comma-separated security groups for interface endpoints.
#                  Defaults to --ecs-security-groups.
#                  Must allow inbound TCP 443 from the Fargate task security
#                  group, otherwise private ECR/CloudWatch access will fail.
#   --save-env     Persist key variables to ~/.bashrc / ~/.zshrc using the
#                  environment variable names listed below.
#   --dry-run      Print actions without making any AWS API calls.
#
# Parameters can also be set as environment variables:
#   AWS_ACCOUNT_ID, AWS_REGION, AWS_BUCKET, AWS_PRINCIPAL, AWS_POLICY_NAME,
#   TRUST_ENTITY, LAMBDA_NAME, LAMBDA_IMAGE_URI, CF_DIST_ID, BACKEND_CF_DIST_ID,
#   FRONTEND_BUCKET, CERT_ARN, DOMAIN, BACKEND_DOMAIN, BUILD_DOMAIN,
#   ECS_CLUSTER, ECS_TASK_DEFINITION, ECS_CONTAINER_NAME, ECS_TASK_ROLE_ARN,
#   ECS_EXECUTION_ROLE_ARN, ECS_SUBNETS, ECS_SECURITY_GROUPS,
#   ECS_ASSIGN_PUBLIC_IP, BUILDER_TASK_POLICY_NAME, BUILDER_QMK_COMMIT,
#   VPC_ID, ROUTE_TABLE_IDS, ENDPOINT_SECURITY_GROUPS
#
# Backward-compatible aliases are also accepted:
#   QMK_NEXUS_BUCKET, QMK_NEXUS_PRINCIPAL, QMK_NEXUS_POLICY_NAME,
#   QMK_NEXUS_LAMBDA,
#   QMK_NEXUS_FRONTEND_DOMAIN, QMK_NEXUS_BACKEND_DOMAIN,
#   QMK_NEXUS_BUILD_DOMAIN, QMK_NEXUS_CF_DIST, QMK_NEXUS_BACKEND_CF_DIST

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

read_qmk_commit_from_meta() {
  local meta="$ROOT/backend/data/qmk_meta.json"
  [[ -f "$meta" ]] || return 0
  python3 - "$meta" <<'PYJSON' 2>/dev/null || true
import json
import sys
try:
    value = json.load(open(sys.argv[1])).get('qmk_commit') or ''
except Exception:
    value = ''
print(value if value != 'unknown' else '')
PYJSON
}

# ── Defaults ──────────────────────────────────────────────────────────────────
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_BUCKET="${QMK_NEXUS_BUCKET:-${AWS_BUCKET:-}}"
AWS_PRINCIPAL="${QMK_NEXUS_PRINCIPAL:-${AWS_PRINCIPAL:-}}"
AWS_POLICY_NAME="${QMK_NEXUS_POLICY_NAME:-${AWS_POLICY_NAME:-qmk-nexus-lambda-policy}}"
LAMBDA_NAME="${QMK_NEXUS_LAMBDA:-${LAMBDA_NAME:-qmk-nexus-api}}"
LAMBDA_IMAGE_URI="${LAMBDA_IMAGE_URI:-}"
FRONTEND_LAMBDA_NAME="${FRONTEND_LAMBDA_NAME:-${FRONTEND_LAMBDA_FUNCTION:-qmk-nexus-frontend}}"
FRONTEND_LAMBDA_IMAGE_URI="${FRONTEND_LAMBDA_IMAGE_URI:-}"
CF_DIST_ID="${QMK_NEXUS_CF_DIST:-${CF_DIST_ID:-}}"
BACKEND_CF_DIST_ID="${QMK_NEXUS_BACKEND_CF_DIST:-${BACKEND_CF_DIST_ID:-}}"
FRONTEND_BUCKET="${FRONTEND_BUCKET:-}"
CERT_ARN="${CERT_ARN:-}"
DOMAIN="${QMK_NEXUS_FRONTEND_DOMAIN:-${DOMAIN:-qmknexus.tebay.dev}}"
BACKEND_DOMAIN="${QMK_NEXUS_BACKEND_DOMAIN:-${BACKEND_DOMAIN:-qmknexus-back.tebay.dev}}"
BUILD_DOMAIN="${QMK_NEXUS_BUILD_DOMAIN:-${BUILD_DOMAIN:-qmknexus-build.tebay.dev}}"
ECS_CLUSTER="${ECS_CLUSTER:-}"
ECS_TASK_DEFINITION="${ECS_TASK_DEFINITION:-}"
ECS_CONTAINER_NAME="${ECS_CONTAINER_NAME:-qmk-nexus-builder}"
ECS_TASK_ROLE_ARN="${ECS_TASK_ROLE_ARN:-}"
ECS_EXECUTION_ROLE_ARN="${ECS_EXECUTION_ROLE_ARN:-}"
ECS_SUBNETS="${ECS_SUBNETS:-}"
ECS_SECURITY_GROUPS="${ECS_SECURITY_GROUPS:-}"
ECS_ASSIGN_PUBLIC_IP="${ECS_ASSIGN_PUBLIC_IP:-DISABLED}"
VPC_ID="${VPC_ID:-}"
ROUTE_TABLE_IDS="${ROUTE_TABLE_IDS:-}"
ENDPOINT_SECURITY_GROUPS="${ENDPOINT_SECURITY_GROUPS:-}"
BUILDER_TASK_POLICY_NAME="${BUILDER_TASK_POLICY_NAME:-qmk-nexus-builder-task-policy}"
BUILDER_QMK_COMMIT="${BUILDER_QMK_COMMIT:-$(read_qmk_commit_from_meta)}"
TRUST_ENTITY="${TRUST_ENTITY:-lambda.amazonaws.com}"
CREATE_ROLE=0
CREATE_BUCKET=0
CREATE_DYNAMODB=0
CREATE_LAMBDA=0
CREATE_FRONTEND_LAMBDA=0
CREATE_CF=0
CREATE_CF_ALIASES=1
CREATE_VPC_ENDPOINTS=0
SAVE_ENV=0
DRY_RUN=0

# ── Argument parsing ──────────────────────────────────────────────────────────
usage() {
  sed -n '/^# Usage:/,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \?//'
  exit 1
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --account-id)      AWS_ACCOUNT_ID="$2";    shift 2 ;;
    --region)          AWS_REGION="$2";        shift 2 ;;
    --bucket)          AWS_BUCKET="$2";        shift 2 ;;
    --principal)       AWS_PRINCIPAL="$2";     shift 2 ;;
    --policy-name)     AWS_POLICY_NAME="$2";   shift 2 ;;
    --trust)           TRUST_ENTITY="$2";      shift 2 ;;
    --create-role)     CREATE_ROLE=1;          shift   ;;
    --create-bucket)   CREATE_BUCKET=1;        shift   ;;
    --create-dynamodb) CREATE_DYNAMODB=1;      shift   ;;
    --lambda-name)     LAMBDA_NAME="$2";       shift 2 ;;
    --lambda-image-uri) LAMBDA_IMAGE_URI="$2"; shift 2 ;;
    --create-lambda)   CREATE_LAMBDA=1;        shift   ;;
    --frontend-lambda-name) FRONTEND_LAMBDA_NAME="$2"; shift 2 ;;
    --frontend-lambda-image-uri) FRONTEND_LAMBDA_IMAGE_URI="$2"; shift 2 ;;
    --create-frontend-lambda) CREATE_FRONTEND_LAMBDA=1; shift ;;
    --cf-dist-id)      CF_DIST_ID="$2";        shift 2 ;;
    --backend-cf-dist-id) BACKEND_CF_DIST_ID="$2"; shift 2 ;;
    --create-cf)       CREATE_CF=1;            shift   ;;
    --create-cf-without-aliases) CREATE_CF_ALIASES=0; shift ;;
    --frontend-bucket) FRONTEND_BUCKET="$2";   shift 2 ;;
    --cert-arn)        CERT_ARN="$2";          shift 2 ;;
    --domain)          DOMAIN="$2";            shift 2 ;;
    --backend-domain)  BACKEND_DOMAIN="$2";    shift 2 ;;
    --build-domain)    BUILD_DOMAIN="$2";      shift 2 ;;
    --ecs-cluster)     ECS_CLUSTER="$2";       shift 2 ;;
    --ecs-task-definition) ECS_TASK_DEFINITION="$2"; shift 2 ;;
    --ecs-container-name) ECS_CONTAINER_NAME="$2"; shift 2 ;;
    --ecs-task-role)   ECS_TASK_ROLE_ARN="$2"; shift 2 ;;
    --ecs-execution-role) ECS_EXECUTION_ROLE_ARN="$2"; shift 2 ;;
    --ecs-subnets)     ECS_SUBNETS="$2";       shift 2 ;;
    --ecs-security-groups) ECS_SECURITY_GROUPS="$2"; shift 2 ;;
    --ecs-assign-public-ip) ECS_ASSIGN_PUBLIC_IP="$2"; shift 2 ;;
    --builder-task-policy-name) BUILDER_TASK_POLICY_NAME="$2"; shift 2 ;;
    --builder-qmk-commit) BUILDER_QMK_COMMIT="$2"; shift 2 ;;
    --create-vpc-endpoints) CREATE_VPC_ENDPOINTS=1; shift ;;
    --vpc-id)           VPC_ID="$2";           shift 2 ;;
    --route-table-ids)  ROUTE_TABLE_IDS="$2";  shift 2 ;;
    --endpoint-security-groups) ENDPOINT_SECURITY_GROUPS="$2"; shift 2 ;;
    --save-env)        SAVE_ENV=1;             shift   ;;
    --dry-run)         DRY_RUN=1;              shift   ;;
    -h|--help)         usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

# ── Validate ──────────────────────────────────────────────────────────────────
MISSING=""
[[ -z "${AWS_ACCOUNT_ID:-}" ]] && MISSING="$MISSING --account-id"
[[ -z "${AWS_BUCKET:-}"     ]] && MISSING="$MISSING --bucket"
[[ -z "${AWS_PRINCIPAL:-}"  ]] && MISSING="$MISSING --principal"
if [[ -n "$MISSING" ]]; then
  echo "Error: missing required parameters:$MISSING"
  echo "Run with --help for usage."
  exit 1
fi

if [[ "$AWS_PRINCIPAL" != *:role/* ]]; then
  echo "Error: --principal must be a full IAM role ARN containing ':role/'"
  exit 1
fi
if [[ "$CREATE_LAMBDA" == "1" && -z "$LAMBDA_IMAGE_URI" ]]; then
  echo "Error: --create-lambda requires --lambda-image-uri"
  exit 1
fi
if [[ "$CREATE_FRONTEND_LAMBDA" == "1" && -z "$FRONTEND_LAMBDA_IMAGE_URI" ]]; then
  echo "Error: --create-frontend-lambda requires --frontend-lambda-image-uri"
  exit 1
fi
if [[ "$CREATE_CF" == "1" && "$CREATE_CF_ALIASES" == "1" && -z "$CERT_ARN" ]]; then
  echo "Error: --create-cf requires --cert-arn"
  exit 1
fi
if [[ "$CREATE_VPC_ENDPOINTS" == "1" ]]; then
  if [[ -z "$VPC_ID" || -z "$ECS_SUBNETS" || -z "$ROUTE_TABLE_IDS" ]]; then
    echo "Error: --create-vpc-endpoints requires --vpc-id, --ecs-subnets, and --route-table-ids"
    exit 1
  fi
  if [[ -z "$ENDPOINT_SECURITY_GROUPS" && -z "$ECS_SECURITY_GROUPS" ]]; then
    echo "Error: --create-vpc-endpoints requires --endpoint-security-groups or --ecs-security-groups"
    exit 1
  fi
fi
if [[ "$ECS_ASSIGN_PUBLIC_IP" == "ENABLED" ]]; then
  echo "Warning: ECS_ASSIGN_PUBLIC_IP=ENABLED adds public IPv4 charges. DISABLED is recommended with VPC endpoints." >&2
fi
if [[ -z "$ENDPOINT_SECURITY_GROUPS" ]]; then
  ENDPOINT_SECURITY_GROUPS="$ECS_SECURITY_GROUPS"
fi

PRINCIPAL_NAME="${AWS_PRINCIPAL##*/}"
POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${AWS_POLICY_NAME}"
BUILDER_TASK_POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${BUILDER_TASK_POLICY_NAME}"
LOG_GROUP="/aws/lambda/${LAMBDA_NAME}"
BUILDS_TABLE="qmk-nexus-builds"
REFRESH_TABLE="qmk-nexus-refresh"

# ── Output helpers ────────────────────────────────────────────────────────────
section() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
info()    { printf '    %s\n' "$*"; }
ok()      { printf '    \033[32m✓\033[0m %s\n' "$*"; }
warn()    { printf '    \033[33m!\033[0m %s\n' "$*"; }
err()     { printf '    \033[31m✗\033[0m %s\n' "$*"; }

# ── Shell rc helpers ──────────────────────────────────────────────────────────
_shell_rc() {
  if [[ -f "${HOME}/.bashrc" ]]; then printf '%s' "${HOME}/.bashrc"
  elif [[ -f "${HOME}/.zshrc" ]]; then printf '%s' "${HOME}/.zshrc"
  else printf '%s' "${HOME}/.profile"
  fi
}

persist_env() {
  local var="$1" val="$2" rc
  rc=$(_shell_rc)
  if grep -q "^export ${var}=" "${rc}" 2>/dev/null; then
    sed -i "s|^export ${var}=.*|export ${var}=\"${val}\"|" "${rc}"
    ok "Updated ${var} in ${rc}"
  else
    printf 'export %s="%s"\n' "${var}" "${val}" >> "${rc}"
    ok "Added ${var} to ${rc}"
  fi
}

# ── Policy generators ─────────────────────────────────────────────────────────

role_name_from_arn() {
  local arn="$1"
  printf '%s' "${arn##*/}"
}

json_string_array_or_star() {
  local values=("$@")
  local filtered=()
  local value
  for value in "${values[@]}"; do
    [[ -n "$value" ]] && filtered+=("$value")
  done
  if [[ "${#filtered[@]}" -eq 0 ]]; then
    printf '"*"'
    return
  fi
  printf '['
  local i
  for i in "${!filtered[@]}"; do
    [[ "$i" != "0" ]] && printf ','
    printf '"%s"' "${filtered[$i]}"
  done
  printf ']'
}

csv_to_args() {
  local csv="$1"
  local item
  IFS=',' read -ra _items <<< "$csv"
  for item in "${_items[@]}"; do
    item="${item//[[:space:]]/}"
    [[ -n "$item" ]] && printf '%s\n' "$item"
  done
}

# Least-privilege IAM policy for the Lambda function:
#   - S3 read/write for per-user SQLite databases
#   - S3 read/write for staged build bundles and artifacts
#   - S3 read for QMK keyboard index
#   - ECS RunTask for Fargate firmware builds
#   - CloudWatch Logs for Lambda execution
build_iam_policy() {
  local pass_role_resources
  pass_role_resources=$(json_string_array_or_star "$ECS_TASK_ROLE_ARN" "$ECS_EXECUTION_ROLE_ARN")
  cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3UserDatabases",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::${AWS_BUCKET}/users/*/db.sqlite"
    },
    {
      "Sid": "S3BuildBundles",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::${AWS_BUCKET}/builds/*"
    },
    {
      "Sid": "S3BuildLifecycle",
      "Effect": "Allow",
      "Action": [
        "s3:GetLifecycleConfiguration",
        "s3:PutLifecycleConfiguration"
      ],
      "Resource": "arn:aws:s3:::${AWS_BUCKET}"
    },
    {
      "Sid": "S3QMKIndex",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${AWS_BUCKET}/qmk-index/*"
    },
    {
      "Sid": "S3ListBucket",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::${AWS_BUCKET}",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["users/", "users/*", "users/*/", "qmk-index/", "qmk-index/*", "builds/", "builds/*"]
        }
      }
    },
    {
      "Sid": "ECSRunBuildTask",
      "Effect": "Allow",
      "Action": [
        "ecs:RunTask"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PassECSTaskRoles",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": ${pass_role_resources},
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ecs-tasks.amazonaws.com"
        }
      }
    },
    {
      "Sid": "DynamoBuildState",
      "Effect": "Allow",
      "Action": [
        "dynamodb:DeleteItem",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Scan",
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${AWS_REGION}:${AWS_ACCOUNT_ID}:table/${BUILDS_TABLE}",
        "arn:aws:dynamodb:${AWS_REGION}:${AWS_ACCOUNT_ID}:table/${REFRESH_TABLE}"
      ]
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": [
        "arn:aws:logs:${AWS_REGION}:${AWS_ACCOUNT_ID}:log-group:/aws/lambda/${LAMBDA_NAME}:*",
        "arn:aws:logs:${AWS_REGION}:${AWS_ACCOUNT_ID}:log-group:/aws/lambda/${FRONTEND_LAMBDA_NAME}:*"
      ]
    }
  ]
}
EOF
}

build_builder_task_policy() {
  cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BuildObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::${AWS_BUCKET}/builds/*"
    },
    {
      "Sid": "S3BuildList",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::${AWS_BUCKET}",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["builds/", "builds/*"]
        }
      }
    }
  ]
}
EOF
}

build_trust_policy() {
  case "$TRUST_ENTITY" in
    arn:*)
      cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "${TRUST_ENTITY}" },
    "Action": "sts:AssumeRole"
  }]
}
EOF
      ;;
    *)
      cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "${TRUST_ENTITY}" },
    "Action": "sts:AssumeRole"
  }]
}
EOF
      ;;
  esac
}

# CORS policy for the user-DB bucket (backend writes; frontend may pre-sign)
build_bucket_cors() {
  cat <<EOF
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": ["https://${DOMAIN}", "https://${BACKEND_DOMAIN}"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
EOF
}

build_lifecycle_config() {
  cat <<EOF
{
  "Rules": [
    {
      "ID": "ExpireQmkNexusBuildsAfterOneDay",
      "Status": "Enabled",
      "Filter": { "Prefix": "builds/" },
      "Expiration": { "Days": 1 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }
  ]
}
EOF
}

# ── IAM helpers ───────────────────────────────────────────────────────────────
apply_iam_policy() {
  local policy_arn="$1"
  local policy_name="$2"
  local description="$3"
  local policy_json="$4"
  if aws iam get-policy --policy-arn "$policy_arn" >/dev/null 2>&1; then
    info "Policy exists; pruning old versions then creating new..."
    # Delete non-default versions first — IAM cap is 5; create fails if full
    aws iam list-policy-versions --policy-arn "$policy_arn" \
      --query 'Versions[?!IsDefaultVersion].VersionId' \
      --output text \
    | tr '\t' '\n' \
    | while read -r vid; do
        [[ -z "$vid" ]] && continue
        aws iam delete-policy-version \
          --policy-arn "$policy_arn" --version-id "$vid" >/dev/null 2>&1 || true
      done
    aws iam create-policy-version \
      --policy-arn "$policy_arn" \
      --policy-document "$policy_json" \
      --set-as-default >/dev/null
    ok "Updated $policy_arn"
  else
    aws iam create-policy \
      --policy-name "$policy_name" \
      --policy-document "$policy_json" \
      --description "$description" \
      >/dev/null
    ok "Created $policy_arn"
  fi
}

attach_iam_policy_to_role() {
  local role_name="$1"
  local policy_arn="$2"
  aws iam attach-role-policy \
    --role-name "$role_name" \
    --policy-arn "$policy_arn" >/dev/null
  ok "Attached $policy_arn to role $role_name"
}

attach_iam_policy() {
  attach_iam_policy_to_role "$PRINCIPAL_NAME" "$POLICY_ARN"
}

create_iam_role() {
  local trust_json
  trust_json=$(build_trust_policy)
  if aws iam get-role --role-name "$PRINCIPAL_NAME" >/dev/null 2>&1; then
    warn "Role $PRINCIPAL_NAME already exists — skipping creation"
  else
    aws iam create-role \
      --role-name "$PRINCIPAL_NAME" \
      --assume-role-policy-document "$trust_json" \
      --description "QMK Nexus Lambda execution role" \
      >/dev/null
    ok "Created role $PRINCIPAL_NAME (trust: $TRUST_ENTITY)"
  fi
}

cf_aliases_json() {
  local domain="$1"
  if [[ "$CREATE_CF_ALIASES" == "1" ]]; then
    printf '"Aliases": {"Quantity": 1, "Items": ["%s"]},' "$domain"
  else
    printf '"Aliases": {"Quantity": 0},'
  fi
}

cf_viewer_certificate_json() {
  if [[ "$CREATE_CF_ALIASES" == "1" ]]; then
    cat <<JSON
"ViewerCertificate": {
  "ACMCertificateArn": "${CERT_ARN}",
  "SSLSupportMethod": "sni-only",
  "MinimumProtocolVersion": "TLSv1.2_2021"
},
JSON
  else
    cat <<'JSON'
"ViewerCertificate": {
  "CloudFrontDefaultCertificate": true
},
JSON
  fi
}

# ── S3 helpers ────────────────────────────────────────────────────────────────
create_s3_bucket() {
  if aws s3api head-bucket --bucket "$AWS_BUCKET" 2>/dev/null; then
    warn "Bucket $AWS_BUCKET already exists — skipping creation"
  else
    if [[ "$AWS_REGION" == "us-east-1" ]]; then
      aws s3api create-bucket --bucket "$AWS_BUCKET" >/dev/null
    else
      aws s3api create-bucket \
        --bucket "$AWS_BUCKET" \
        --region "$AWS_REGION" \
        --create-bucket-configuration LocationConstraint="$AWS_REGION" >/dev/null
    fi
    ok "Created bucket s3://$AWS_BUCKET"
  fi

  aws s3api put-public-access-block \
    --bucket "$AWS_BUCKET" \
    --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
    >/dev/null
  ok "Blocked all public access"

  aws s3api put-bucket-versioning \
    --bucket "$AWS_BUCKET" \
    --versioning-configuration Status=Enabled >/dev/null
  ok "Enabled versioning"

  aws s3api put-bucket-cors \
    --bucket "$AWS_BUCKET" \
    --cors-configuration "{\"CORSRules\": $(build_bucket_cors)}" >/dev/null
  ok "Applied CORS policy (AllowedOrigins: https://${DOMAIN}, https://${BACKEND_DOMAIN})"

  aws s3api put-bucket-lifecycle-configuration \
    --bucket "$AWS_BUCKET" \
    --lifecycle-configuration "$(build_lifecycle_config)" >/dev/null
  ok "Applied 1-day expiration lifecycle for s3://${AWS_BUCKET}/builds/"
}

# ── DynamoDB helpers ─────────────────────────────────────────────────────────
create_dynamodb_table() {
  local table_name="$1"
  local hash_key="$2"

  if aws dynamodb describe-table --table-name "$table_name" --region "$AWS_REGION" >/dev/null 2>&1; then
    warn "DynamoDB table $table_name already exists — skipping creation"
  else
    aws dynamodb create-table \
      --table-name "$table_name" \
      --attribute-definitions "AttributeName=${hash_key},AttributeType=S" \
      --key-schema "AttributeName=${hash_key},KeyType=HASH" \
      --billing-mode PAY_PER_REQUEST \
      --region "$AWS_REGION" >/dev/null
    ok "Created DynamoDB table $table_name"
    aws dynamodb wait table-exists --table-name "$table_name" --region "$AWS_REGION"
  fi

  aws dynamodb update-time-to-live \
    --table-name "$table_name" \
    --time-to-live-specification "Enabled=true,AttributeName=ttl" \
    --region "$AWS_REGION" >/dev/null 2>&1 || true
  ok "Enabled TTL on $table_name.ttl"
}

create_dynamodb_tables() {
  create_dynamodb_table "$BUILDS_TABLE" "id"
  create_dynamodb_table "$REFRESH_TABLE" "token_hash"
}

# ── VPC endpoint helpers ──────────────────────────────────────────────────────
vpc_endpoint_id() {
  local service_name="$1"
  aws ec2 describe-vpc-endpoints \
    --region "$AWS_REGION" \
    --filters "Name=vpc-id,Values=${VPC_ID}" "Name=service-name,Values=${service_name}" \
    --query 'VpcEndpoints[?State!=`deleted` && State!=`deleting`].VpcEndpointId | [0]' \
    --output text 2>/dev/null
}

ensure_gateway_endpoint() {
  local service_name="$1"
  local existing
  existing=$(vpc_endpoint_id "$service_name")
  if [[ -n "$existing" && "$existing" != "None" ]]; then
    warn "VPC endpoint already exists for $service_name: $existing"
    return
  fi

  mapfile -t route_tables < <(csv_to_args "$ROUTE_TABLE_IDS")
  aws ec2 create-vpc-endpoint \
    --region "$AWS_REGION" \
    --vpc-id "$VPC_ID" \
    --service-name "$service_name" \
    --vpc-endpoint-type Gateway \
    --route-table-ids "${route_tables[@]}" \
    >/dev/null
  ok "Created gateway endpoint: $service_name"
}

ensure_interface_endpoint() {
  local service_name="$1"
  local existing
  existing=$(vpc_endpoint_id "$service_name")
  if [[ -n "$existing" && "$existing" != "None" ]]; then
    warn "VPC endpoint already exists for $service_name: $existing"
    return
  fi

  mapfile -t subnets < <(csv_to_args "$ECS_SUBNETS")
  mapfile -t security_groups < <(csv_to_args "$ENDPOINT_SECURITY_GROUPS")
  aws ec2 create-vpc-endpoint \
    --region "$AWS_REGION" \
    --vpc-id "$VPC_ID" \
    --service-name "$service_name" \
    --vpc-endpoint-type Interface \
    --subnet-ids "${subnets[@]}" \
    --security-group-ids "${security_groups[@]}" \
    --private-dns-enabled \
    >/dev/null
  ok "Created interface endpoint: $service_name"
}

create_vpc_endpoints() {
  ensure_gateway_endpoint "com.amazonaws.${AWS_REGION}.s3"
  ensure_interface_endpoint "com.amazonaws.${AWS_REGION}.ecr.api"
  ensure_interface_endpoint "com.amazonaws.${AWS_REGION}.ecr.dkr"
  ensure_interface_endpoint "com.amazonaws.${AWS_REGION}.logs"
}

# ── Lambda helpers ────────────────────────────────────────────────────────────
lambda_env_vars() {
  local vars="ENVIRONMENT=production,S3_BUCKET=${AWS_BUCKET},FRONTEND_URL=https://${DOMAIN},API_BASE_URL=https://${DOMAIN},BUILD_RUNNER=ecs,ECS_CLUSTER=${ECS_CLUSTER},ECS_TASK_DEFINITION=${ECS_TASK_DEFINITION},ECS_CONTAINER_NAME=${ECS_CONTAINER_NAME},ECS_SUBNETS=${ECS_SUBNETS},ECS_SECURITY_GROUPS=${ECS_SECURITY_GROUPS},ECS_ASSIGN_PUBLIC_IP=${ECS_ASSIGN_PUBLIC_IP}"
  if [[ -n "$BUILDER_QMK_COMMIT" ]]; then
    vars="${vars},BUILDER_QMK_COMMIT=${BUILDER_QMK_COMMIT}"
  fi
  printf 'Variables={%s}' "$vars"
}

create_or_update_lambda() {
  if aws lambda get-function --function-name "$LAMBDA_NAME" >/dev/null 2>&1; then
    local package_type
    package_type=$(aws lambda get-function-configuration \
      --function-name "$LAMBDA_NAME" \
      --query 'PackageType' \
      --output text)
    if [[ "$package_type" == "Zip" ]]; then
      err "Lambda $LAMBDA_NAME is PackageType=Zip and cannot be updated to an image in place."
      err "Delete/recreate it, or create a new image-package Lambda name."
      exit 1
    fi
    info "Function exists; updating image..."
    aws lambda update-function-code \
      --function-name "$LAMBDA_NAME" \
      --image-uri "$LAMBDA_IMAGE_URI" \
      --query 'FunctionArn' --output text >/dev/null
    ok "Updated image for $LAMBDA_NAME"
    warn "Existing Lambda environment was left intact. Ensure it contains:"
    warn "  ENVIRONMENT=production"
    warn "  AWS_REGION is provided by Lambda"
    warn "  S3_BUCKET=${AWS_BUCKET}"
    warn "  FRONTEND_URL=https://${DOMAIN}"
    warn "  API_BASE_URL=https://${DOMAIN}"
    warn "  BUILD_RUNNER=ecs"
    warn "  ECS_CLUSTER=${ECS_CLUSTER}"
    warn "  ECS_TASK_DEFINITION=${ECS_TASK_DEFINITION}"
    warn "  ECS_CONTAINER_NAME=${ECS_CONTAINER_NAME}"
    warn "  ECS_SUBNETS=${ECS_SUBNETS}"
    warn "  ECS_SECURITY_GROUPS=${ECS_SECURITY_GROUPS}"
    warn "  ECS_ASSIGN_PUBLIC_IP=${ECS_ASSIGN_PUBLIC_IP}"
    [[ -n "$BUILDER_QMK_COMMIT" ]] && warn "  BUILDER_QMK_COMMIT=${BUILDER_QMK_COMMIT}"
  else
    info "Creating Lambda function $LAMBDA_NAME..."
    aws lambda create-function \
      --function-name "$LAMBDA_NAME" \
      --package-type Image \
      --role "$AWS_PRINCIPAL" \
      --code "ImageUri=${LAMBDA_IMAGE_URI}" \
      --timeout 30 \
      --memory-size 512 \
      --environment "$(lambda_env_vars)" \
      --description "QMK Nexus API (FastAPI + Mangum)" \
      --query 'FunctionArn' --output text >/dev/null
    ok "Created $LAMBDA_NAME"
    warn "Set remaining env vars (JWT_SECRET, GOOGLE_CLIENT_ID, etc.) in the console or via:"
    warn "  aws lambda update-function-configuration --function-name $LAMBDA_NAME --environment ..."
  fi

  # Ensure a Function URL exists (NONE auth — JWT cookie handles it)
  local url_config
  url_config=$(aws lambda get-function-url-config \
    --function-name "$LAMBDA_NAME" \
    --query 'FunctionUrl' --output text 2>/dev/null || echo "")
  if [[ -z "$url_config" || "$url_config" == "None" ]]; then
    url_config=$(aws lambda create-function-url-config \
      --function-name "$LAMBDA_NAME" \
      --auth-type NONE \
      --cors "AllowOrigins=https://${DOMAIN},AllowHeaders=content-type,authorization,AllowMethods=*,AllowCredentials=true" \
      --query 'FunctionUrl' --output text)
    ok "Created Function URL: $url_config"
    # Allow public invoke via Function URL
    aws lambda add-permission \
      --function-name "$LAMBDA_NAME" \
      --statement-id FunctionURLAllowPublicAccess \
      --action lambda:InvokeFunctionUrl \
      --principal '*' \
      --function-url-auth-type NONE >/dev/null 2>&1 || true
    aws lambda add-permission \
      --function-name "$LAMBDA_NAME" \
      --statement-id FunctionURLAllowInvokeFunction \
      --action lambda:InvokeFunction \
      --principal '*' \
      --invoked-via-function-url >/dev/null 2>&1 || true
  else
    aws lambda update-function-url-config \
      --function-name "$LAMBDA_NAME" \
      --cors "AllowOrigins=https://${DOMAIN},AllowHeaders=content-type,authorization,AllowMethods=*,AllowCredentials=true" \
      >/dev/null
    ok "Function URL exists: $url_config"
    ok "Updated Function URL CORS for https://${DOMAIN}"
  fi

  LAMBDA_URL="$url_config"
}

create_or_update_frontend_lambda() {
  if aws lambda get-function --function-name "$FRONTEND_LAMBDA_NAME" >/dev/null 2>&1; then
    local package_type
    package_type=$(aws lambda get-function-configuration \
      --function-name "$FRONTEND_LAMBDA_NAME" \
      --query 'PackageType' \
      --output text)
    if [[ "$package_type" == "Zip" ]]; then
      err "Lambda $FRONTEND_LAMBDA_NAME is PackageType=Zip and cannot be updated to an image in place."
      err "Delete/recreate it, or create a new image-package Lambda name."
      exit 1
    fi
    info "Frontend function exists; updating image..."
    aws lambda update-function-code \
      --function-name "$FRONTEND_LAMBDA_NAME" \
      --image-uri "$FRONTEND_LAMBDA_IMAGE_URI" \
      --query 'FunctionArn' --output text >/dev/null
    aws lambda update-function-configuration \
      --function-name "$FRONTEND_LAMBDA_NAME" \
      --environment "Variables={ENVIRONMENT=production,API_BASE_URL=https://${BACKEND_DOMAIN}}" \
      >/dev/null
    ok "Updated image for $FRONTEND_LAMBDA_NAME"
  else
    info "Creating frontend Lambda function $FRONTEND_LAMBDA_NAME..."
    aws lambda create-function \
      --function-name "$FRONTEND_LAMBDA_NAME" \
      --package-type Image \
      --role "$AWS_PRINCIPAL" \
      --code "ImageUri=${FRONTEND_LAMBDA_IMAGE_URI}" \
      --timeout 30 \
      --memory-size 512 \
      --environment "Variables={ENVIRONMENT=production,API_BASE_URL=https://${BACKEND_DOMAIN}}" \
      --description "QMK Nexus frontend (React static app + /api proxy)" \
      --query 'FunctionArn' --output text >/dev/null
    ok "Created $FRONTEND_LAMBDA_NAME"
  fi

  local url_config
  url_config=$(aws lambda get-function-url-config \
    --function-name "$FRONTEND_LAMBDA_NAME" \
    --query 'FunctionUrl' --output text 2>/dev/null || echo "")
  if [[ -z "$url_config" || "$url_config" == "None" ]]; then
    url_config=$(aws lambda create-function-url-config \
      --function-name "$FRONTEND_LAMBDA_NAME" \
      --auth-type NONE \
      --query 'FunctionUrl' --output text)
    ok "Created frontend Function URL: $url_config"
    aws lambda add-permission \
      --function-name "$FRONTEND_LAMBDA_NAME" \
      --statement-id FunctionURLAllowPublicAccess \
      --action lambda:InvokeFunctionUrl \
      --principal '*' \
      --function-url-auth-type NONE >/dev/null 2>&1 || true
    aws lambda add-permission \
      --function-name "$FRONTEND_LAMBDA_NAME" \
      --statement-id FunctionURLAllowInvokeFunction \
      --action lambda:InvokeFunction \
      --principal '*' \
      --invoked-via-function-url >/dev/null 2>&1 || true
  else
    ok "Frontend Function URL exists: $url_config"
  fi

  FRONTEND_LAMBDA_URL="$url_config"
}

# ── CloudFront helpers ────────────────────────────────────────────────────────

# Add or update the /api/* behavior in an existing distribution to forward to
# the Lambda Function URL.  Idempotent: updates in-place if behavior exists.
wire_api_origin() {
  local func_url="$1"
  # Strip trailing slash; CloudFront origin domain must not have path
  local fn_domain
  fn_domain=$(printf '%s' "$func_url" | sed 's|https://||;s|/.*||')

  local etag
  etag=$(aws cloudfront get-distribution-config \
    --id "$CF_DIST_ID" --query ETag --output text)

  local new_config
  new_config=$(python3 <<PYEOF
import json, subprocess

dist = json.loads(subprocess.check_output([
    'aws', 'cloudfront', 'get-distribution-config',
    '--id', '${CF_DIST_ID}', '--output', 'json'
]))
config = dist['DistributionConfig']
origin_id = 'qmk-nexus-lambda'
fn_domain  = '${fn_domain}'

# Add Lambda origin if not present
origins = config['Origins']['Items']
if not any(o['Id'] == origin_id for o in origins):
    origins.append({
        'Id': origin_id,
        'DomainName': fn_domain,
        'OriginPath': '',
        'CustomHeaders': {'Quantity': 0},
        'CustomOriginConfig': {
            'HTTPPort': 80,
            'HTTPSPort': 443,
            'OriginProtocolPolicy': 'https-only',
            'OriginSslProtocols': {'Quantity': 1, 'Items': ['TLSv1.2']},
            'OriginReadTimeout': 30,
            'OriginKeepaliveTimeout': 5,
        },
        'ConnectionAttempts': 3,
        'ConnectionTimeout': 10,
        'OriginShield': {'Enabled': False},
    })
    config['Origins']['Quantity'] = len(origins)

# Add /api/* behavior if not present (or update it)
cb = config.setdefault('CacheBehaviors', {'Quantity': 0, 'Items': []})
cb.setdefault('Items', [])
existing = next((b for b in cb['Items'] if b['PathPattern'] == '/api/*'), None)
api_behavior = {
    'PathPattern': '/api/*',
    'TargetOriginId': origin_id,
    'ViewerProtocolPolicy': 'redirect-to-https',
    'AllowedMethods': {
        'Quantity': 7,
        'Items': ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
        'CachedMethods': {'Quantity': 2, 'Items': ['GET', 'HEAD']},
    },
    'ForwardedValues': {
        'QueryString': True,
        'Cookies': {'Forward': 'all'},
        'Headers': {'Quantity': 3, 'Items': ['Origin', 'Authorization', 'Content-Type']},
        'QueryStringCacheKeys': {'Quantity': 0},
    },
    'MinTTL': 0,
    'DefaultTTL': 0,
    'MaxTTL': 0,
    'Compress': True,
    'TrustedSigners': {'Enabled': False, 'Quantity': 0},
    'TrustedKeyGroups': {'Enabled': False, 'Quantity': 0},
    'LambdaFunctionAssociations': {'Quantity': 0},
    'FunctionAssociations': {'Quantity': 0},
    'FieldLevelEncryptionId': '',
    'SmoothStreaming': False,
}
if existing:
    idx = cb['Items'].index(existing)
    cb['Items'][idx] = api_behavior
else:
    cb['Items'].insert(0, api_behavior)
    cb['Quantity'] = len(cb['Items'])

print(json.dumps(config))
PYEOF
  )

  aws cloudfront update-distribution \
    --id "$CF_DIST_ID" \
    --if-match "$etag" \
    --distribution-config "$new_config" \
    --query 'Distribution.Status' \
    --output text >/dev/null
  ok "CloudFront distribution updated — deploying (may take a few minutes)"
  ok "API origin: https://${fn_domain}"
}

# Create a new CloudFront distribution with S3 default origin + /api/* Lambda.
create_cf_distribution() {
  local func_url="$1"
  local fn_domain
  fn_domain=$(printf '%s' "$func_url" | sed 's|https://||;s|/.*||')
  local s3_domain="${FRONTEND_BUCKET}.s3.${AWS_REGION}.amazonaws.com"

  info "Creating OAC for frontend bucket..."
  local oac_id
  oac_id=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config \
      "Name=${FRONTEND_BUCKET}.s3.amazonaws.com,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3,Description=OAC for QMK Nexus frontend" \
    --query 'OriginAccessControl.Id' --output text 2>/dev/null || \
    aws cloudfront list-origin-access-controls \
      --query "OriginAccessControlList.Items[?Name=='${FRONTEND_BUCKET}.s3.amazonaws.com'].Id" \
      --output text)
  ok "OAC: $oac_id"

  local dist_config
  dist_config=$(cat <<JSON
{
  "Comment": "QMK Nexus — ${DOMAIN}",
  "CallerReference": "qmk-nexus-${DOMAIN}-$(date +%s)",
  "Enabled": true,
  "HttpVersion": "http2and3",
  "DefaultRootObject": "index.html",
  "Aliases": {"Quantity": 1, "Items": ["${DOMAIN}"]},
  "ViewerCertificate": {
    "ACMCertificateArn": "${CERT_ARN}",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "Origins": {
    "Quantity": 2,
    "Items": [
      {
        "Id": "qmk-nexus-frontend",
        "DomainName": "${s3_domain}",
        "OriginPath": "",
        "CustomHeaders": {"Quantity": 0},
        "S3OriginConfig": {"OriginAccessIdentity": ""},
        "OriginAccessControlId": "${oac_id}",
        "ConnectionAttempts": 3,
        "ConnectionTimeout": 10,
        "OriginShield": {"Enabled": false}
      },
      {
        "Id": "qmk-nexus-lambda",
        "DomainName": "${fn_domain}",
        "OriginPath": "",
        "CustomHeaders": {"Quantity": 0},
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only",
          "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
          "OriginReadTimeout": 30,
          "OriginKeepaliveTimeout": 5
        },
        "ConnectionAttempts": 3,
        "ConnectionTimeout": 10,
        "OriginShield": {"Enabled": false}
      }
    ]
  },
  "CacheBehaviors": {
    "Quantity": 1,
    "Items": [{
      "PathPattern": "/api/*",
      "TargetOriginId": "qmk-nexus-lambda",
      "ViewerProtocolPolicy": "redirect-to-https",
      "AllowedMethods": {
        "Quantity": 7,
        "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
        "CachedMethods": {"Quantity": 2, "Items": ["GET","HEAD"]}
      },
      "ForwardedValues": {
        "QueryString": true,
        "Cookies": {"Forward": "all"},
        "Headers": {"Quantity": 3, "Items": ["Origin","Authorization","Content-Type"]},
        "QueryStringCacheKeys": {"Quantity": 0}
      },
      "MinTTL": 0, "DefaultTTL": 0, "MaxTTL": 0,
      "Compress": true,
      "TrustedSigners": {"Enabled": false, "Quantity": 0},
      "TrustedKeyGroups": {"Enabled": false, "Quantity": 0},
      "LambdaFunctionAssociations": {"Quantity": 0},
      "FunctionAssociations": {"Quantity": 0},
      "FieldLevelEncryptionId": "",
      "SmoothStreaming": false
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "qmk-nexus-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET","HEAD"],
      "CachedMethods": {"Quantity": 2, "Items": ["GET","HEAD"]}
    },
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {"Forward": "none"},
      "Headers": {"Quantity": 0},
      "QueryStringCacheKeys": {"Quantity": 0}
    },
    "MinTTL": 0, "DefaultTTL": 86400, "MaxTTL": 31536000,
    "Compress": true,
    "TrustedSigners": {"Enabled": false, "Quantity": 0},
    "TrustedKeyGroups": {"Enabled": false, "Quantity": 0},
    "LambdaFunctionAssociations": {"Quantity": 0},
    "FunctionAssociations": {"Quantity": 0},
    "FieldLevelEncryptionId": "",
    "SmoothStreaming": false
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [{
      "ErrorCode": 404,
      "ResponsePagePath": "/index.html",
      "ResponseCode": "200",
      "ErrorCachingMinTTL": 10
    }]
  },
  "PriceClass": "PriceClass_100",
  "Restrictions": {"GeoRestriction": {"RestrictionType": "none", "Quantity": 0}},
  "WebACLId": ""
}
JSON
  )

  CF_DIST_ID=$(aws cloudfront create-distribution \
    --distribution-config "$dist_config" \
    --query 'Distribution.Id' --output text)
  local cf_domain
  cf_domain=$(aws cloudfront get-distribution \
    --id "$CF_DIST_ID" \
    --query 'Distribution.DomainName' --output text)

  ok "Created CloudFront distribution: $CF_DIST_ID"
  ok "CloudFront domain: $cf_domain"
  warn "Add a CNAME record: ${DOMAIN} → ${cf_domain}"
  warn "Also apply an S3 bucket policy granting CloudFront OAC read access to ${FRONTEND_BUCKET}:"
  warn "  Principal: cloudfront.amazonaws.com"
  warn "  Condition: AWS:SourceArn = arn:aws:cloudfront::${AWS_ACCOUNT_ID}:distribution/${CF_DIST_ID}"
}

wire_backend_distribution() {
  local func_url="$1"
  local fn_domain
  fn_domain=$(printf '%s' "$func_url" | sed 's|https://||;s|/.*||')

  local etag
  etag=$(aws cloudfront get-distribution-config \
    --id "$BACKEND_CF_DIST_ID" --query ETag --output text)

  local new_config
  new_config=$(python3 <<PYEOF
import json, subprocess

dist = json.loads(subprocess.check_output([
    'aws', 'cloudfront', 'get-distribution-config',
    '--id', '${BACKEND_CF_DIST_ID}', '--output', 'json'
]))
config = dist['DistributionConfig']
origin_id = 'qmk-nexus-lambda'
fn_domain = '${fn_domain}'

config['Origins'] = {
    'Quantity': 1,
    'Items': [{
        'Id': origin_id,
        'DomainName': fn_domain,
        'OriginPath': '',
        'CustomHeaders': {'Quantity': 0},
        'CustomOriginConfig': {
            'HTTPPort': 80,
            'HTTPSPort': 443,
            'OriginProtocolPolicy': 'https-only',
            'OriginSslProtocols': {'Quantity': 1, 'Items': ['TLSv1.2']},
            'OriginReadTimeout': 30,
            'OriginKeepaliveTimeout': 5,
        },
        'ConnectionAttempts': 3,
        'ConnectionTimeout': 10,
        'OriginShield': {'Enabled': False},
    }],
}
if '${CERT_ARN}' and '${CREATE_CF_ALIASES}' == '1':
    config['Aliases'] = {'Quantity': 1, 'Items': ['${BACKEND_DOMAIN}']}
    config['ViewerCertificate'] = {
        'ACMCertificateArn': '${CERT_ARN}',
        'SSLSupportMethod': 'sni-only',
        'MinimumProtocolVersion': 'TLSv1.2_2021',
    }
config['DefaultCacheBehavior'] = {
    'TargetOriginId': origin_id,
    'ViewerProtocolPolicy': 'redirect-to-https',
    'AllowedMethods': {
        'Quantity': 7,
        'Items': ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
        'CachedMethods': {'Quantity': 2, 'Items': ['GET', 'HEAD']},
    },
    'ForwardedValues': {
        'QueryString': True,
        'Cookies': {'Forward': 'all'},
        'Headers': {'Quantity': 3, 'Items': ['Origin', 'Authorization', 'Content-Type']},
        'QueryStringCacheKeys': {'Quantity': 0},
    },
    'MinTTL': 0,
    'DefaultTTL': 0,
    'MaxTTL': 0,
    'Compress': True,
    'TrustedSigners': {'Enabled': False, 'Quantity': 0},
    'TrustedKeyGroups': {'Enabled': False, 'Quantity': 0},
    'LambdaFunctionAssociations': {'Quantity': 0},
    'FunctionAssociations': {'Quantity': 0},
    'FieldLevelEncryptionId': '',
    'SmoothStreaming': False,
}
config['CacheBehaviors'] = {'Quantity': 0}
print(json.dumps(config))
PYEOF
  )

  aws cloudfront update-distribution \
    --id "$BACKEND_CF_DIST_ID" \
    --if-match "$etag" \
    --distribution-config "$new_config" \
    --query 'Distribution.Status' \
    --output text >/dev/null
  ok "Backend CloudFront distribution updated — deploying (may take a few minutes)"
  ok "Backend origin: https://${fn_domain}"
}

create_backend_cf_distribution() {
  local func_url="$1"
  local fn_domain
  fn_domain=$(printf '%s' "$func_url" | sed 's|https://||;s|/.*||')

  local dist_config
  dist_config=$(cat <<JSON
{
  "Comment": "QMK Nexus API — ${BACKEND_DOMAIN}",
  "CallerReference": "qmk-nexus-api-${BACKEND_DOMAIN}-$(date +%s)",
  "Enabled": true,
  "HttpVersion": "http2and3",
  $(cf_aliases_json "$BACKEND_DOMAIN")
  $(cf_viewer_certificate_json)
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "qmk-nexus-lambda",
      "DomainName": "${fn_domain}",
      "OriginPath": "",
      "CustomHeaders": {"Quantity": 0},
      "CustomOriginConfig": {
        "HTTPPort": 80,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "https-only",
        "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
        "OriginReadTimeout": 30,
        "OriginKeepaliveTimeout": 5
      },
      "ConnectionAttempts": 3,
      "ConnectionTimeout": 10,
      "OriginShield": {"Enabled": false}
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "qmk-nexus-lambda",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
      "CachedMethods": {"Quantity": 2, "Items": ["GET","HEAD"]}
    },
    "ForwardedValues": {
      "QueryString": true,
      "Cookies": {"Forward": "all"},
      "Headers": {"Quantity": 3, "Items": ["Origin","Authorization","Content-Type"]},
      "QueryStringCacheKeys": {"Quantity": 0}
    },
    "MinTTL": 0, "DefaultTTL": 0, "MaxTTL": 0,
    "Compress": true,
    "TrustedSigners": {"Enabled": false, "Quantity": 0},
    "TrustedKeyGroups": {"Enabled": false, "Quantity": 0},
    "LambdaFunctionAssociations": {"Quantity": 0},
    "FunctionAssociations": {"Quantity": 0},
    "FieldLevelEncryptionId": "",
    "SmoothStreaming": false
  },
  "PriceClass": "PriceClass_100",
  "Restrictions": {"GeoRestriction": {"RestrictionType": "none", "Quantity": 0}},
  "WebACLId": ""
}
JSON
  )

  BACKEND_CF_DIST_ID=$(aws cloudfront create-distribution \
    --distribution-config "$dist_config" \
    --query 'Distribution.Id' --output text)
  local cf_domain
  cf_domain=$(aws cloudfront get-distribution \
    --id "$BACKEND_CF_DIST_ID" \
    --query 'Distribution.DomainName' --output text)

  ok "Created backend CloudFront distribution: $BACKEND_CF_DIST_ID"
  ok "Backend CloudFront domain: $cf_domain"
  warn "Add a CNAME record: ${BACKEND_DOMAIN} → ${cf_domain}"
}

wire_frontend_distribution() {
  local func_url="$1"
  local fn_domain
  fn_domain=$(printf '%s' "$func_url" | sed 's|https://||;s|/.*||')

  local etag
  etag=$(aws cloudfront get-distribution-config \
    --id "$CF_DIST_ID" --query ETag --output text)

  local new_config
  new_config=$(python3 <<PYEOF
import json, subprocess

dist = json.loads(subprocess.check_output([
    'aws', 'cloudfront', 'get-distribution-config',
    '--id', '${CF_DIST_ID}', '--output', 'json'
]))
config = dist['DistributionConfig']
origin_id = 'qmk-nexus-frontend-lambda'
fn_domain = '${fn_domain}'

config['Origins'] = {
    'Quantity': 1,
    'Items': [{
        'Id': origin_id,
        'DomainName': fn_domain,
        'OriginPath': '',
        'CustomHeaders': {'Quantity': 0},
        'CustomOriginConfig': {
            'HTTPPort': 80,
            'HTTPSPort': 443,
            'OriginProtocolPolicy': 'https-only',
            'OriginSslProtocols': {'Quantity': 1, 'Items': ['TLSv1.2']},
            'OriginReadTimeout': 30,
            'OriginKeepaliveTimeout': 5,
        },
        'ConnectionAttempts': 3,
        'ConnectionTimeout': 10,
        'OriginShield': {'Enabled': False},
    }],
}
if '${CERT_ARN}' and '${CREATE_CF_ALIASES}' == '1':
    config['Aliases'] = {'Quantity': 1, 'Items': ['${DOMAIN}']}
    config['ViewerCertificate'] = {
        'ACMCertificateArn': '${CERT_ARN}',
        'SSLSupportMethod': 'sni-only',
        'MinimumProtocolVersion': 'TLSv1.2_2021',
    }
config['DefaultCacheBehavior'] = {
    'TargetOriginId': origin_id,
    'ViewerProtocolPolicy': 'redirect-to-https',
    'AllowedMethods': {
        'Quantity': 7,
        'Items': ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
        'CachedMethods': {'Quantity': 2, 'Items': ['GET', 'HEAD']},
    },
    'ForwardedValues': {
        'QueryString': True,
        'Cookies': {'Forward': 'all'},
        'Headers': {'Quantity': 3, 'Items': ['Origin', 'Authorization', 'Content-Type']},
        'QueryStringCacheKeys': {'Quantity': 0},
    },
    'MinTTL': 0,
    'DefaultTTL': 0,
    'MaxTTL': 31536000,
    'Compress': True,
    'TrustedSigners': {'Enabled': False, 'Quantity': 0},
    'TrustedKeyGroups': {'Enabled': False, 'Quantity': 0},
    'LambdaFunctionAssociations': {'Quantity': 0},
    'FunctionAssociations': {'Quantity': 0},
    'FieldLevelEncryptionId': '',
    'SmoothStreaming': False,
}
config['CacheBehaviors'] = {'Quantity': 0}
config['CustomErrorResponses'] = {'Quantity': 0}
print(json.dumps(config))
PYEOF
  )

  aws cloudfront update-distribution \
    --id "$CF_DIST_ID" \
    --if-match "$etag" \
    --distribution-config "$new_config" \
    --query 'Distribution.Status' \
    --output text >/dev/null
  ok "Frontend CloudFront distribution updated — deploying (may take a few minutes)"
  ok "Frontend origin: https://${fn_domain}"
}

create_frontend_cf_distribution() {
  local func_url="$1"
  local fn_domain
  fn_domain=$(printf '%s' "$func_url" | sed 's|https://||;s|/.*||')

  local dist_config
  dist_config=$(cat <<JSON
{
  "Comment": "QMK Nexus frontend — ${DOMAIN}",
  "CallerReference": "qmk-nexus-frontend-${DOMAIN}-$(date +%s)",
  "Enabled": true,
  "HttpVersion": "http2and3",
  $(cf_aliases_json "$DOMAIN")
  $(cf_viewer_certificate_json)
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "qmk-nexus-frontend-lambda",
      "DomainName": "${fn_domain}",
      "OriginPath": "",
      "CustomHeaders": {"Quantity": 0},
      "CustomOriginConfig": {
        "HTTPPort": 80,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "https-only",
        "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
        "OriginReadTimeout": 30,
        "OriginKeepaliveTimeout": 5
      },
      "ConnectionAttempts": 3,
      "ConnectionTimeout": 10,
      "OriginShield": {"Enabled": false}
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "qmk-nexus-frontend-lambda",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
      "CachedMethods": {"Quantity": 2, "Items": ["GET","HEAD"]}
    },
    "ForwardedValues": {
      "QueryString": true,
      "Cookies": {"Forward": "all"},
      "Headers": {"Quantity": 3, "Items": ["Origin","Authorization","Content-Type"]},
      "QueryStringCacheKeys": {"Quantity": 0}
    },
    "MinTTL": 0, "DefaultTTL": 0, "MaxTTL": 31536000,
    "Compress": true,
    "TrustedSigners": {"Enabled": false, "Quantity": 0},
    "TrustedKeyGroups": {"Enabled": false, "Quantity": 0},
    "LambdaFunctionAssociations": {"Quantity": 0},
    "FunctionAssociations": {"Quantity": 0},
    "FieldLevelEncryptionId": "",
    "SmoothStreaming": false
  },
  "PriceClass": "PriceClass_100",
  "Restrictions": {"GeoRestriction": {"RestrictionType": "none", "Quantity": 0}},
  "WebACLId": ""
}
JSON
  )

  CF_DIST_ID=$(aws cloudfront create-distribution \
    --distribution-config "$dist_config" \
    --query 'Distribution.Id' --output text)
  local cf_domain
  cf_domain=$(aws cloudfront get-distribution \
    --id "$CF_DIST_ID" \
    --query 'Distribution.DomainName' --output text)

  ok "Created frontend CloudFront distribution: $CF_DIST_ID"
  ok "Frontend CloudFront domain: $cf_domain"
  warn "Add a CNAME record: ${DOMAIN} → ${cf_domain}"
}

# ── Main ──────────────────────────────────────────────────────────────────────
section "QMK Nexus — AWS setup (${DOMAIN})"
info "AWS_ACCOUNT_ID : $AWS_ACCOUNT_ID"
info "AWS_REGION     : $AWS_REGION"
info "AWS_BUCKET     : $AWS_BUCKET"
info "AWS_PRINCIPAL  : $AWS_PRINCIPAL"
info "AWS_POLICY_NAME: $AWS_POLICY_NAME"
info "LAMBDA_NAME    : $LAMBDA_NAME"
info "FRONTEND_LAMBDA: $FRONTEND_LAMBDA_NAME"
info "FRONTEND_DOMAIN: $DOMAIN"
info "BACKEND_DOMAIN : $BACKEND_DOMAIN"
info "BUILD_DOMAIN   : $BUILD_DOMAIN"
info "ECS_PUBLIC_IP  : $ECS_ASSIGN_PUBLIC_IP"
[[ -n "$VPC_ID" ]] && info "VPC_ID         : $VPC_ID"
[[ -n "$CF_DIST_ID" ]]    && info "CF_DIST_ID     : $CF_DIST_ID"
[[ -n "$BACKEND_CF_DIST_ID" ]] && info "BACKEND_CF_DIST: $BACKEND_CF_DIST_ID"
[[ -n "$FRONTEND_BUCKET" ]] && info "FRONTEND_BUCKET: $FRONTEND_BUCKET"
[[ "$DRY_RUN" == "1" ]]   && warn "Dry-run mode — no changes will be made"

# ── 0. Create IAM role ────────────────────────────────────────────────────────
if [[ "$CREATE_ROLE" == "1" ]]; then
  section "0. Creating IAM role"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would create role: $PRINCIPAL_NAME (trust: $TRUST_ENTITY)"
    info "Trust policy document:"
    build_trust_policy
  else
    create_iam_role
  fi
fi

# ── 1. IAM policy ─────────────────────────────────────────────────────────────
section "1. IAM policy"
IAM_POLICY_JSON=$(build_iam_policy)
if [[ "$DRY_RUN" == "1" ]]; then
  info "IAM policy document:"
  echo "$IAM_POLICY_JSON"
else
  apply_iam_policy \
    "$POLICY_ARN" \
    "$AWS_POLICY_NAME" \
    "Least-privilege S3, DynamoDB, ECS, and CloudWatch access for qmk-nexus Lambda" \
    "$IAM_POLICY_JSON"
  attach_iam_policy
fi

if [[ -n "$ECS_TASK_ROLE_ARN" ]]; then
  section "1b. Builder task IAM policy"
  BUILDER_TASK_POLICY_JSON=$(build_builder_task_policy)
  BUILDER_TASK_ROLE_NAME=$(role_name_from_arn "$ECS_TASK_ROLE_ARN")
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would create/update builder task policy: $BUILDER_TASK_POLICY_ARN"
    echo "$BUILDER_TASK_POLICY_JSON"
    info "Would attach to ECS task role: $BUILDER_TASK_ROLE_NAME"
  else
    apply_iam_policy \
      "$BUILDER_TASK_POLICY_ARN" \
      "$BUILDER_TASK_POLICY_NAME" \
      "S3 build bundle access for qmk-nexus Fargate builder tasks" \
      "$BUILDER_TASK_POLICY_JSON"
    attach_iam_policy_to_role "$BUILDER_TASK_ROLE_NAME" "$BUILDER_TASK_POLICY_ARN"
  fi
else
  warn "ECS task role not provided; builder task S3 policy was not attached."
  warn "Set --ecs-task-role to let Fargate download sources and upload artifacts."
fi

# ── 2. S3 bucket ──────────────────────────────────────────────────────────────
if [[ "$CREATE_BUCKET" == "1" ]]; then
  section "2. S3 bucket (${AWS_BUCKET})"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would create s3://$AWS_BUCKET in $AWS_REGION"
    info "Would enable versioning and block all public access"
    info "CORS policy document:"
    build_bucket_cors
    info "Lifecycle policy document:"
    build_lifecycle_config
  else
    create_s3_bucket
  fi
fi

# ── 3. DynamoDB ───────────────────────────────────────────────────────────────
if [[ "$CREATE_DYNAMODB" == "1" ]]; then
  section "3. DynamoDB"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would create DynamoDB table: $BUILDS_TABLE (partition key: id)"
    info "Would create DynamoDB table: $REFRESH_TABLE (partition key: token_hash)"
    info "Would enable TTL on attribute: ttl"
  else
    create_dynamodb_tables
  fi
fi

# ── 4. VPC endpoints ─────────────────────────────────────────────────────────
if [[ "$CREATE_VPC_ENDPOINTS" == "1" ]]; then
  section "4. VPC endpoints"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would create S3 gateway endpoint in VPC $VPC_ID"
    info "  Route tables: $ROUTE_TABLE_IDS"
    info "Would create private interface endpoints in VPC $VPC_ID"
    info "  Services       : ecr.api, ecr.dkr, logs"
    info "  Subnets        : $ECS_SUBNETS"
    info "  Security groups: $ENDPOINT_SECURITY_GROUPS"
    warn "Endpoint security groups must allow inbound TCP 443 from the Fargate task security group."
  else
    warn "Endpoint security groups must allow inbound TCP 443 from the Fargate task security group."
    create_vpc_endpoints
  fi
fi

# ── 5. Lambda function ────────────────────────────────────────────────────────
LAMBDA_URL=""
if [[ "$CREATE_LAMBDA" == "1" ]]; then
  section "5. Lambda function (${LAMBDA_NAME})"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would create/update Lambda: $LAMBDA_NAME"
    info "  Package  : Image"
    info "  Role     : $AWS_PRINCIPAL"
    info "  Image    : $LAMBDA_IMAGE_URI"
    info "  Env      : ENVIRONMENT=production, S3_BUCKET=$AWS_BUCKET"
    info "             FRONTEND_URL=https://${DOMAIN}"
    info "             API_BASE_URL=https://${DOMAIN}"
    info "             BUILD_RUNNER=ecs"
    info "             ECS_CLUSTER=${ECS_CLUSTER}"
    info "             ECS_TASK_DEFINITION=${ECS_TASK_DEFINITION}"
    info "             ECS_CONTAINER_NAME=${ECS_CONTAINER_NAME}"
    info "             ECS_SUBNETS=${ECS_SUBNETS}"
    info "             ECS_SECURITY_GROUPS=${ECS_SECURITY_GROUPS}"
    info "             ECS_ASSIGN_PUBLIC_IP=${ECS_ASSIGN_PUBLIC_IP}"
    [[ -n "$BUILDER_QMK_COMMIT" ]] && info "             BUILDER_QMK_COMMIT=${BUILDER_QMK_COMMIT}"
    info "Would create Function URL with CORS for https://${DOMAIN}"
  else
    create_or_update_lambda
  fi
fi

if [[ "$CREATE_FRONTEND_LAMBDA" == "1" ]]; then
  section "5b. Frontend Lambda function (${FRONTEND_LAMBDA_NAME})"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would create/update frontend Lambda: $FRONTEND_LAMBDA_NAME"
    info "  Package  : Image"
    info "  Role     : $AWS_PRINCIPAL"
    info "  Image    : $FRONTEND_LAMBDA_IMAGE_URI"
    info "  Env      : ENVIRONMENT=production, API_BASE_URL=https://${BACKEND_DOMAIN}"
    info "Would create frontend Function URL"
  else
    create_or_update_frontend_lambda
  fi
fi

# ── 6. CloudFront ─────────────────────────────────────────────────────────────
if [[ "$CREATE_CF" == "1" || -n "$CF_DIST_ID" || -n "$BACKEND_CF_DIST_ID" ]]; then
  section "6. CloudFront"

  # Resolve Function URL if not already set (Lambda may have been created above)
  if [[ -z "$LAMBDA_URL" && "$DRY_RUN" == "0" ]]; then
    LAMBDA_URL=$(aws lambda get-function-url-config \
      --function-name "$LAMBDA_NAME" \
      --query 'FunctionUrl' --output text 2>/dev/null || echo "")
  fi
  if [[ -z "${FRONTEND_LAMBDA_URL:-}" && "$DRY_RUN" == "0" ]]; then
    FRONTEND_LAMBDA_URL=$(aws lambda get-function-url-config \
      --function-name "$FRONTEND_LAMBDA_NAME" \
      --query 'FunctionUrl' --output text 2>/dev/null || echo "")
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    if [[ "$CREATE_CF" == "1" ]]; then
      info "Would create frontend CloudFront distribution"
      info "  Default origin : frontend Lambda Function URL"
      info "  Domain         : $DOMAIN"
      info "Would create backend CloudFront distribution"
      info "  Default origin : Lambda Function URL"
      info "  Domain         : $BACKEND_DOMAIN"
      info "  Certificate    : $CERT_ARN"
    fi
    if [[ -n "$CF_DIST_ID" ]]; then
      info "Would update frontend distribution $CF_DIST_ID to use frontend Lambda Function URL"
    fi
    if [[ -n "$BACKEND_CF_DIST_ID" ]]; then
      info "Would update backend distribution $BACKEND_CF_DIST_ID to use Lambda Function URL"
    fi
  else
    if [[ "$CREATE_CF" == "1" ]]; then
      if [[ -z "${FRONTEND_LAMBDA_URL:-}" ]]; then
        warn "No frontend Lambda Function URL found for $FRONTEND_LAMBDA_NAME — skipping frontend CloudFront distribution"
        warn "Run with --create-frontend-lambda first, then re-run."
      else
        create_frontend_cf_distribution "$FRONTEND_LAMBDA_URL"
      fi
      if [[ -z "$LAMBDA_URL" ]]; then
        warn "No backend Lambda Function URL found for $LAMBDA_NAME — skipping backend CloudFront distribution"
        warn "Run with --create-lambda first, then re-run."
      else
        create_backend_cf_distribution "$LAMBDA_URL"
      fi
    else
      if [[ -n "$CF_DIST_ID" ]]; then
        if [[ -z "${FRONTEND_LAMBDA_URL:-}" ]]; then
          warn "No frontend Lambda Function URL found for $FRONTEND_LAMBDA_NAME — skipping frontend CloudFront wiring"
        else
          info "Wiring frontend Lambda Function URL to distribution $CF_DIST_ID..."
          wire_frontend_distribution "$FRONTEND_LAMBDA_URL"
        fi
      fi
      if [[ -n "$BACKEND_CF_DIST_ID" ]]; then
        if [[ -z "$LAMBDA_URL" ]]; then
          warn "No backend Lambda Function URL found for $LAMBDA_NAME — skipping backend CloudFront wiring"
        else
          info "Wiring Lambda Function URL to backend distribution $BACKEND_CF_DIST_ID..."
          wire_backend_distribution "$LAMBDA_URL"
        fi
      fi
    fi
  fi
fi

# ── 7. Save env vars ──────────────────────────────────────────────────────────
if [[ "$SAVE_ENV" == "1" ]]; then
  section "7. Saving environment variables"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would write to $(_shell_rc):"
    info "  export AWS_ACCOUNT_ID=\"$AWS_ACCOUNT_ID\""
    info "  export AWS_REGION=\"$AWS_REGION\""
    info "  export AWS_BUCKET=\"$AWS_BUCKET\""
    info "  export AWS_PRINCIPAL=\"$AWS_PRINCIPAL\""
    info "  export AWS_POLICY_NAME=\"$AWS_POLICY_NAME\""
    info "  export TRUST_ENTITY=\"$TRUST_ENTITY\""
    info "  export LAMBDA_NAME=\"$LAMBDA_NAME\""
    [[ -n "$LAMBDA_IMAGE_URI" ]] && info "  export LAMBDA_IMAGE_URI=\"$LAMBDA_IMAGE_URI\""
    info "  export FRONTEND_LAMBDA_NAME=\"$FRONTEND_LAMBDA_NAME\""
    [[ -n "$FRONTEND_LAMBDA_IMAGE_URI" ]] && info "  export FRONTEND_LAMBDA_IMAGE_URI=\"$FRONTEND_LAMBDA_IMAGE_URI\""
    info "  export DOMAIN=\"$DOMAIN\""
    info "  export BACKEND_DOMAIN=\"$BACKEND_DOMAIN\""
    info "  export BUILD_DOMAIN=\"$BUILD_DOMAIN\""
    [[ -n "$FRONTEND_BUCKET" ]] && info "  export FRONTEND_BUCKET=\"$FRONTEND_BUCKET\""
    [[ -n "$CERT_ARN" ]] && info "  export CERT_ARN=\"$CERT_ARN\""
    info "  export ECS_CLUSTER=\"$ECS_CLUSTER\""
    info "  export ECS_TASK_DEFINITION=\"$ECS_TASK_DEFINITION\""
    info "  export ECS_CONTAINER_NAME=\"$ECS_CONTAINER_NAME\""
    info "  export ECS_TASK_ROLE_ARN=\"$ECS_TASK_ROLE_ARN\""
    info "  export ECS_EXECUTION_ROLE_ARN=\"$ECS_EXECUTION_ROLE_ARN\""
    info "  export ECS_SUBNETS=\"$ECS_SUBNETS\""
    info "  export ECS_SECURITY_GROUPS=\"$ECS_SECURITY_GROUPS\""
    info "  export ECS_ASSIGN_PUBLIC_IP=\"$ECS_ASSIGN_PUBLIC_IP\""
    info "  export BUILDER_TASK_POLICY_NAME=\"$BUILDER_TASK_POLICY_NAME\""
    [[ -n "$BUILDER_QMK_COMMIT" ]] && info "  export BUILDER_QMK_COMMIT=\"$BUILDER_QMK_COMMIT\""
    info "  export VPC_ID=\"$VPC_ID\""
    info "  export ROUTE_TABLE_IDS=\"$ROUTE_TABLE_IDS\""
    info "  export ENDPOINT_SECURITY_GROUPS=\"$ENDPOINT_SECURITY_GROUPS\""
    [[ -n "$CF_DIST_ID" ]] && info "  export CF_DIST_ID=\"$CF_DIST_ID\""
    [[ -n "$BACKEND_CF_DIST_ID" ]] && info "  export BACKEND_CF_DIST_ID=\"$BACKEND_CF_DIST_ID\""
  else
    persist_env AWS_ACCOUNT_ID     "$AWS_ACCOUNT_ID"
    persist_env AWS_REGION         "$AWS_REGION"
    persist_env AWS_BUCKET         "$AWS_BUCKET"
    persist_env AWS_PRINCIPAL      "$AWS_PRINCIPAL"
    persist_env AWS_POLICY_NAME    "$AWS_POLICY_NAME"
    persist_env TRUST_ENTITY       "$TRUST_ENTITY"
    persist_env LAMBDA_NAME        "$LAMBDA_NAME"
    [[ -n "$LAMBDA_IMAGE_URI" ]] && persist_env LAMBDA_IMAGE_URI "$LAMBDA_IMAGE_URI"
    persist_env FRONTEND_LAMBDA_NAME "$FRONTEND_LAMBDA_NAME"
    [[ -n "$FRONTEND_LAMBDA_IMAGE_URI" ]] && persist_env FRONTEND_LAMBDA_IMAGE_URI "$FRONTEND_LAMBDA_IMAGE_URI"
    persist_env DOMAIN             "$DOMAIN"
    persist_env BACKEND_DOMAIN     "$BACKEND_DOMAIN"
    persist_env BUILD_DOMAIN       "$BUILD_DOMAIN"
    [[ -n "$FRONTEND_BUCKET" ]] && persist_env FRONTEND_BUCKET "$FRONTEND_BUCKET"
    [[ -n "$CERT_ARN" ]] && persist_env CERT_ARN "$CERT_ARN"
    persist_env ECS_CLUSTER                "$ECS_CLUSTER"
    persist_env ECS_TASK_DEFINITION        "$ECS_TASK_DEFINITION"
    persist_env ECS_CONTAINER_NAME         "$ECS_CONTAINER_NAME"
    persist_env ECS_TASK_ROLE_ARN          "$ECS_TASK_ROLE_ARN"
    persist_env ECS_EXECUTION_ROLE_ARN     "$ECS_EXECUTION_ROLE_ARN"
    persist_env ECS_SUBNETS                "$ECS_SUBNETS"
    persist_env ECS_SECURITY_GROUPS        "$ECS_SECURITY_GROUPS"
    persist_env ECS_ASSIGN_PUBLIC_IP       "$ECS_ASSIGN_PUBLIC_IP"
    persist_env BUILDER_TASK_POLICY_NAME   "$BUILDER_TASK_POLICY_NAME"
    [[ -n "$BUILDER_QMK_COMMIT" ]] && persist_env BUILDER_QMK_COMMIT "$BUILDER_QMK_COMMIT"
    persist_env VPC_ID                     "$VPC_ID"
    persist_env ROUTE_TABLE_IDS            "$ROUTE_TABLE_IDS"
    persist_env ENDPOINT_SECURITY_GROUPS   "$ENDPOINT_SECURITY_GROUPS"
    [[ -n "$CF_DIST_ID" ]] && persist_env CF_DIST_ID "$CF_DIST_ID"
    [[ -n "$BACKEND_CF_DIST_ID" ]] && persist_env BACKEND_CF_DIST_ID "$BACKEND_CF_DIST_ID"
    info "Run: source $(_shell_rc)"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
section "Done"
if [[ "$DRY_RUN" == "0" ]]; then
  info "Lambda env vars still required (set in console or update-function-configuration):"
  info "  JWT_SECRET"
  info "  GOOGLE_CLIENT_ID"
  info "  GOOGLE_CLIENT_SECRET"
  info "  FRONTEND_URL=https://${DOMAIN}"
  info "  API_BASE_URL=https://${DOMAIN}"
  info "  BUILD_RUNNER=ecs"
  info "  ECS_CLUSTER=${ECS_CLUSTER}"
  info "  ECS_TASK_DEFINITION=${ECS_TASK_DEFINITION}"
  info "  ECS_CONTAINER_NAME=${ECS_CONTAINER_NAME}"
  info "  ECS_SUBNETS=${ECS_SUBNETS}"
  info "  ECS_SECURITY_GROUPS=${ECS_SECURITY_GROUPS}"
  info "  ECS_ASSIGN_PUBLIC_IP=${ECS_ASSIGN_PUBLIC_IP}"
  [[ -n "$BUILDER_QMK_COMMIT" ]] && info "  BUILDER_QMK_COMMIT=${BUILDER_QMK_COMMIT}"
  info "Frontend Lambda env vars:"
  info "  API_BASE_URL=https://${BACKEND_DOMAIN}"
  info "Builder image must be deployed as the ECS task definition container."
  [[ -n "${LAMBDA_URL:-}" ]] && info "Function URL: $LAMBDA_URL"
  [[ -n "${FRONTEND_LAMBDA_URL:-}" ]] && info "Frontend URL: $FRONTEND_LAMBDA_URL"
  [[ -n "${CF_DIST_ID:-}" ]] && info "CloudFront  : https://$DOMAIN  (dist: $CF_DIST_ID)"
  [[ -n "${BACKEND_CF_DIST_ID:-}" ]] && info "Backend CF  : https://$BACKEND_DOMAIN  (dist: $BACKEND_CF_DIST_ID)"
fi
