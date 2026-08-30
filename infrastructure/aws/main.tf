# Sprint 9 -- AWS infrastructure scaffold.
#
# This is a starting point, not a push-button deploy: it provisions the shape
# of infrastructure described in the project plan (EKS, RDS, ElastiCache,
# ECR, VPC) using widely-used community modules. It has NOT been run or
# validated against a real AWS account from here -- that requires real AWS
# credentials and will incur real cost, so it's intentionally left for you
# to review, adjust (instance sizes, region, tags) and apply yourself.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "region" {
  default = "eu-west-1"
}

variable "project_name" {
  default = "sentinelops"
}

provider "aws" {
  region = var.region
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project_name}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.region}a", "${var.region}b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true # cost-saving for a portfolio project; use per-AZ NAT for real prod
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "${var.project_name}-cluster"
  cluster_version = "1.29"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    default = {
      min_size       = 1
      max_size       = 3
      desired_size   = 2
      instance_types = ["t3.medium"]
    }
  }
}

resource "aws_db_subnet_group" "sentinelops" {
  name       = "${var.project_name}-db-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_db_instance" "postgres" {
  identifier             = "${var.project_name}-postgres"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t3.micro" # smallest viable size for a portfolio project
  allocated_storage      = 20
  db_name                = "sentinelops"
  username               = "postgres"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.sentinelops.name
  skip_final_snapshot    = true
  publicly_accessible    = false
}

variable "db_password" {
  description = "Set via TF_VAR_db_password env var, never commit a real value"
  sensitive   = true
}

resource "aws_elasticache_subnet_group" "sentinelops" {
  name       = "${var.project_name}-redis-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project_name}-redis"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  subnet_group_name    = aws_elasticache_subnet_group.sentinelops.name
}

resource "aws_ecr_repository" "api" {
  name = "${var.project_name}-api"
}

resource "aws_ecr_repository" "web" {
  name = "${var.project_name}-web"
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "postgres_endpoint" {
  value = aws_db_instance.postgres.endpoint
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "ecr_api_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecr_web_url" {
  value = aws_ecr_repository.web.repository_url
}
