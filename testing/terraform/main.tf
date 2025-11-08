provider "aws" {}

resource "aws_s3_bucket" "b" { bucket = "example-bucket" }

module "mod" {
  source = "./modules/mod"
} 