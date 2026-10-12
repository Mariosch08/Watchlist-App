#!/usr/bin/env bash
# Creates the S3 bucket for the Terraform state (once, idempotent) and writes infra/envs/dev/backend.hcl.
# State in S3 survives a deleted Codespace; locking uses S3 lock files (Terraform >= 1.10).
set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-central-1}}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="watchlist-tfstate-${ACCOUNT_ID}"
ENV_DIR="$(cd "$(dirname "$0")/../envs/dev" && pwd)"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "State bucket $BUCKET already exists"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  echo "Created state bucket $BUCKET"
fi

cat > "$ENV_DIR/backend.hcl" <<HCL
bucket       = "$BUCKET"
key          = "watchlist/dev/terraform.tfstate"
region       = "$REGION"
encrypt      = true
use_lockfile = true
HCL
echo "Wrote $ENV_DIR/backend.hcl - next: cd infra/envs/dev && terraform init -backend-config=backend.hcl"
