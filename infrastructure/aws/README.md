# AWS deployment (Sprint 9)

`main.tf` is a Terraform scaffold provisioning the shape of infrastructure the
project plan calls for: a VPC, an EKS cluster, an RDS Postgres instance, an
ElastiCache Redis instance, and two ECR repositories for your images.

**This has not been applied or validated against a real AWS account.** Doing so
needs your AWS credentials and will incur real cost -- both good reasons this is
a "your end" step rather than something to run blind.

## What's left to do (on your end)

1. Install Terraform and the AWS CLI, and configure credentials
   (`aws configure`) for an account/region you're comfortable spending on.
2. Review `main.tf` -- instance sizes are set to the smallest viable options
   (`t3.medium` nodes, `db.t3.micro`, `cache.t3.micro`) to keep a portfolio
   deployment cheap. Adjust `region` and `project_name` as you like.
3. Set the database password without committing it:
   ```bash
   export TF_VAR_db_password="pick-a-real-password"
   ```
4. Initialize and apply:
   ```bash
   cd infrastructure/aws
   terraform init
   terraform plan
   terraform apply
   ```
5. Push your images to the ECR repos Terraform created:
   ```bash
   aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <ecr_api_url>
   docker tag sentinelops-api:latest <ecr_api_url>:latest
   docker push <ecr_api_url>:latest
   # repeat for web
   ```
6. Point `kubectl` at the new EKS cluster and apply the manifests in
   `../kubernetes/` (swap `image:` and `imagePullPolicy: Never` for the real
   ECR URL and `imagePullPolicy: Always`, and swap `host.docker.internal` for
   the real RDS/ElastiCache endpoints from the Terraform outputs):
   ```bash
   aws eks update-kubeconfig --name sentinelops-cluster --region <region>
   kubectl apply -f ../kubernetes/
   ```
7. **Tear it down when you're done demoing** -- this is real infrastructure
   billing by the hour:
   ```bash
   terraform destroy
   ```

## Why this is scaffolded, not run

Applying this blind, without your review of cost, region, and account, would be
irresponsible -- Terraform can create real, billable resources, and getting it
wrong (wrong region, wrong account, forgetting to destroy) costs real money.
This gives you a reviewed, ready-to-apply starting point instead.
