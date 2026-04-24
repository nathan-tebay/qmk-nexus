#!/usr/bin/env bash
# aws-setup.sh — create and wire AWS resources for qmknexus.tebay.dev.
#
# What this script does:
#   1. Optionally creates the IAM execution role named in --principal.
#   2. Creates (or updates) a least-privilege IAM managed policy covering the
#      S3 user-database prefix and CloudWatch Logs, then attaches it.
#   3. Optionally creates the S3 bucket and configures CORS + public-access block.
#   4. Optionally creates a Lambda function from a deployment zip.
#   5. Optionally creates or updates a Lambda Function URL and wires it as a
#      CloudFront origin, adding a /api/* cache behavior to the distribution.
#   6. Optionally writes key variables to your shell rc file.
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
#     [--lambda-name qmk-nexus-api] \
#     [--lambda-zip path/to/function.zip] \
#     [--create-lambda] \
#     [--cf-dist-id EXXXXXXXXXX] \
#     [--create-cf --frontend-bucket qmk-nexus-frontend --cert-arn arn:aws:acm:...] \
#     [--domain qmknexus.tebay.dev] \
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
#                  frontend at --domain.
#   --lambda-name  Name of the Lambda function (default: qmk-nexus-api).
#   --lambda-zip   Path to a deployment zip built by the CI pipeline.
#                  Required when --create-lambda is set.
#   --create-lambda
#                  Create the Lambda function from --lambda-zip.  If the
#                  function already exists the code is updated in-place.
#                  Attaches the execution role and sets ENVIRONMENT=production.
#   --cf-dist-id   Existing CloudFront distribution ID.  When set without
#                  --create-cf, the script adds the Lambda Function URL as
#                  an origin and wires a /api/* cache behavior.
#   --create-cf    Create a new CloudFront distribution.  Requires
#                  --frontend-bucket and --cert-arn.
#   --frontend-bucket
#                  S3 bucket that hosts the compiled React frontend.
#                  Used as the default CloudFront origin.
#   --cert-arn     ACM certificate ARN (must be in us-east-1) for --domain.
#   --domain       Custom domain for the CloudFront distribution.
#                  (default: qmknexus.tebay.dev)
#   --save-env     Persist key variables to ~/.bashrc / ~/.zshrc.
#   --dry-run      Print actions without making any AWS API calls.
#
# Environment variable equivalents:
#   AWS_ACCOUNT_ID, AWS_REGION, AWS_BUCKET, AWS_PRINCIPAL, AWS_POLICY_NAME,
#   LAMBDA_NAME, CF_DIST_ID, FRONTEND_BUCKET, CERT_ARN, DOMAIN

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_POLICY_NAME="${AWS_POLICY_NAME:-qmk-nexus-lambda-policy}"
LAMBDA_NAME="${LAMBDA_NAME:-qmk-nexus-api}"
CF_DIST_ID="${CF_DIST_ID:-}"
FRONTEND_BUCKET="${FRONTEND_BUCKET:-}"
CERT_ARN="${CERT_ARN:-}"
DOMAIN="${DOMAIN:-qmknexus.tebay.dev}"
LAMBDA_ZIP=""
TRUST_ENTITY="lambda.amazonaws.com"
CREATE_ROLE=0
CREATE_BUCKET=0
CREATE_LAMBDA=0
CREATE_CF=0
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
    --lambda-name)     LAMBDA_NAME="$2";       shift 2 ;;
    --lambda-zip)      LAMBDA_ZIP="$2";        shift 2 ;;
    --create-lambda)   CREATE_LAMBDA=1;        shift   ;;
    --cf-dist-id)      CF_DIST_ID="$2";        shift 2 ;;
    --create-cf)       CREATE_CF=1;            shift   ;;
    --frontend-bucket) FRONTEND_BUCKET="$2";   shift 2 ;;
    --cert-arn)        CERT_ARN="$2";          shift 2 ;;
    --domain)          DOMAIN="$2";            shift 2 ;;
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
if [[ "$CREATE_LAMBDA" == "1" && -z "$LAMBDA_ZIP" ]]; then
  echo "Error: --create-lambda requires --lambda-zip"
  exit 1
fi
if [[ "$CREATE_CF" == "1" && (-z "$FRONTEND_BUCKET" || -z "$CERT_ARN") ]]; then
  echo "Error: --create-cf requires --frontend-bucket and --cert-arn"
  exit 1
fi

PRINCIPAL_NAME="${AWS_PRINCIPAL##*/}"
POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${AWS_POLICY_NAME}"
LOG_GROUP="/aws/lambda/${LAMBDA_NAME}"

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

# Least-privilege IAM policy for the Lambda function:
#   - S3 read/write for per-user SQLite databases
#   - S3 read for QMK keyboard index
#   - CloudWatch Logs for Lambda execution
build_iam_policy() {
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
          "s3:prefix": ["users/", "users/*/", "qmk-index/", "qmk-index/*"]
        }
      }
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:${AWS_REGION}:${AWS_ACCOUNT_ID}:log-group:${LOG_GROUP}:*"
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
    "AllowedOrigins": ["https://${DOMAIN}"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
EOF
}

# ── IAM helpers ───────────────────────────────────────────────────────────────
apply_iam_policy() {
  local policy_json="$1"
  if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
    info "Policy exists; creating new version..."
    aws iam create-policy-version \
      --policy-arn "$POLICY_ARN" \
      --policy-document "$policy_json" \
      --set-as-default >/dev/null
    aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
      --query 'Versions[?!IsDefaultVersion].VersionId' \
      --output text \
    | tr '\t' '\n' \
    | while read -r vid; do
        aws iam delete-policy-version \
          --policy-arn "$POLICY_ARN" --version-id "$vid" >/dev/null 2>&1 || true
      done
    ok "Updated $POLICY_ARN"
  else
    aws iam create-policy \
      --policy-name "$AWS_POLICY_NAME" \
      --policy-document "$policy_json" \
      --description "Least-privilege S3 + CloudWatch access for qmk-nexus Lambda" \
      >/dev/null
    ok "Created $POLICY_ARN"
  fi
}

attach_iam_policy() {
  aws iam attach-role-policy \
    --role-name "$PRINCIPAL_NAME" \
    --policy-arn "$POLICY_ARN" >/dev/null
  ok "Attached to role $PRINCIPAL_NAME"
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
  ok "Applied CORS policy (AllowedOrigins: https://${DOMAIN})"
}

# ── Lambda helpers ────────────────────────────────────────────────────────────
create_or_update_lambda() {
  if aws lambda get-function --function-name "$LAMBDA_NAME" >/dev/null 2>&1; then
    info "Function exists; updating code..."
    aws lambda update-function-code \
      --function-name "$LAMBDA_NAME" \
      --zip-file "fileb://${LAMBDA_ZIP}" \
      --query 'FunctionArn' --output text >/dev/null
    ok "Updated code for $LAMBDA_NAME"
  else
    info "Creating Lambda function $LAMBDA_NAME..."
    aws lambda create-function \
      --function-name "$LAMBDA_NAME" \
      --runtime python3.12 \
      --role "$AWS_PRINCIPAL" \
      --handler main.handler \
      --zip-file "fileb://${LAMBDA_ZIP}" \
      --timeout 30 \
      --memory-size 512 \
      --environment "Variables={ENVIRONMENT=production,AWS_S3_BUCKET=${AWS_BUCKET}}" \
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
      --cors "AllowOrigins=https://${DOMAIN},AllowHeaders=content-type,AllowMethods=*,AllowCredentials=true" \
      --query 'FunctionUrl' --output text)
    ok "Created Function URL: $url_config"
    # Allow public invoke via Function URL
    aws lambda add-permission \
      --function-name "$LAMBDA_NAME" \
      --statement-id FunctionURLAllowPublicAccess \
      --action lambda:InvokeFunctionUrl \
      --principal '*' \
      --function-url-auth-type NONE >/dev/null 2>&1 || true
  else
    ok "Function URL exists: $url_config"
  fi

  LAMBDA_URL="$url_config"
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
            'HTTPSPort': 443,
            'OriginProtocolPolicy': 'https-only',
            'OriginSSLProtocols': {'Quantity': 1, 'Items': ['TLSv1.2']},
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
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only",
          "OriginSSLProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
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

# ── Main ──────────────────────────────────────────────────────────────────────
section "QMK Nexus — AWS setup (${DOMAIN})"
info "AWS_ACCOUNT_ID : $AWS_ACCOUNT_ID"
info "AWS_REGION     : $AWS_REGION"
info "AWS_BUCKET     : $AWS_BUCKET"
info "AWS_PRINCIPAL  : $AWS_PRINCIPAL"
info "AWS_POLICY_NAME: $AWS_POLICY_NAME"
info "LAMBDA_NAME    : $LAMBDA_NAME"
[[ -n "$CF_DIST_ID" ]]    && info "CF_DIST_ID     : $CF_DIST_ID"
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
  apply_iam_policy "$IAM_POLICY_JSON"
  attach_iam_policy
fi

# ── 2. S3 bucket ──────────────────────────────────────────────────────────────
if [[ "$CREATE_BUCKET" == "1" ]]; then
  section "2. S3 bucket (${AWS_BUCKET})"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would create s3://$AWS_BUCKET in $AWS_REGION"
    info "Would enable versioning and block all public access"
    info "CORS policy document:"
    build_bucket_cors
  else
    create_s3_bucket
  fi
fi

# ── 3. Lambda function ────────────────────────────────────────────────────────
LAMBDA_URL=""
if [[ "$CREATE_LAMBDA" == "1" ]]; then
  section "3. Lambda function (${LAMBDA_NAME})"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would create/update Lambda: $LAMBDA_NAME"
    info "  Runtime  : python3.12"
    info "  Handler  : main.handler"
    info "  Role     : $AWS_PRINCIPAL"
    info "  Zip      : $LAMBDA_ZIP"
    info "Would create Function URL with CORS for https://${DOMAIN}"
  else
    create_or_update_lambda
  fi
fi

# ── 4. CloudFront ─────────────────────────────────────────────────────────────
if [[ "$CREATE_CF" == "1" || -n "$CF_DIST_ID" ]]; then
  section "4. CloudFront"

  # Resolve Function URL if not already set (Lambda may have been created above)
  if [[ -z "$LAMBDA_URL" && "$DRY_RUN" == "0" ]]; then
    LAMBDA_URL=$(aws lambda get-function-url-config \
      --function-name "$LAMBDA_NAME" \
      --query 'FunctionUrl' --output text 2>/dev/null || echo "")
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    if [[ "$CREATE_CF" == "1" ]]; then
      info "Would create CloudFront distribution"
      info "  Default origin : s3://$FRONTEND_BUCKET (OAC)"
      info "  /api/* origin  : Lambda Function URL"
      info "  Domain         : $DOMAIN"
      info "  Certificate    : $CERT_ARN"
    else
      info "Would add Lambda Function URL as origin to $CF_DIST_ID"
      info "Would add /api/* cache behavior"
    fi
  else
    if [[ -z "$LAMBDA_URL" ]]; then
      warn "No Lambda Function URL found for $LAMBDA_NAME — skipping CloudFront wiring"
      warn "Run with --create-lambda first, then re-run."
    elif [[ "$CREATE_CF" == "1" ]]; then
      create_cf_distribution "$LAMBDA_URL"
    else
      info "Wiring Lambda Function URL to distribution $CF_DIST_ID..."
      wire_api_origin "$LAMBDA_URL"
    fi
  fi
fi

# ── 5. Save env vars ──────────────────────────────────────────────────────────
if [[ "$SAVE_ENV" == "1" ]]; then
  section "5. Saving environment variables"
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Would write to $(_shell_rc):"
    info "  export AWS_ACCOUNT_ID=\"$AWS_ACCOUNT_ID\""
    info "  export AWS_REGION=\"$AWS_REGION\""
    info "  export QMK_NEXUS_BUCKET=\"$AWS_BUCKET\""
    info "  export QMK_NEXUS_LAMBDA=\"$LAMBDA_NAME\""
    [[ -n "$CF_DIST_ID" ]] && info "  export QMK_NEXUS_CF_DIST=\"$CF_DIST_ID\""
  else
    persist_env AWS_ACCOUNT_ID     "$AWS_ACCOUNT_ID"
    persist_env AWS_REGION         "$AWS_REGION"
    persist_env QMK_NEXUS_BUCKET   "$AWS_BUCKET"
    persist_env QMK_NEXUS_LAMBDA   "$LAMBDA_NAME"
    [[ -n "$CF_DIST_ID" ]] && persist_env QMK_NEXUS_CF_DIST "$CF_DIST_ID"
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
  [[ -n "$LAMBDA_URL" ]] && info "Function URL: $LAMBDA_URL"
  [[ -n "$CF_DIST_ID" ]] && info "CloudFront  : https://$DOMAIN  (dist: $CF_DIST_ID)"
fi
