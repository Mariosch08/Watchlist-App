terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # Bucket etc. come from backend.hcl, created by infra/scripts/bootstrap-state.sh.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "watchlist-app"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
