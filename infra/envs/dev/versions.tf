terraform {
  required_version = ">= 1.6"

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

  # Local state for now. Moving to an S3 backend is listed under "Offen für Mario" in PROGRESS.md.
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
