# Safe to commit — no secrets here.
# Secrets (redis_auth_token) come from GitHub Secret: TF_VAR_REDIS_AUTH_TOKEN

aws_region   = "ap-south-1"
environment  = "production"
project      = "oae"

# ElastiCache
redis_node_type    = "cache.t3.small"
redis_num_clusters = 2

# S3 (existing bucket)
s3_bucket_name = "oae-iitd-files-957905179934"

# Domain
domain = "anyserver.site"

# GitHub OIDC
github_org  = "oae-iitd"
github_repo = "oae_iitd"
