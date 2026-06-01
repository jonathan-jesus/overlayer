# STATE BUCKET BOOTSTRAP
#
# Creates the S3 bucket that Pulumi uses to store infrastructure state.
# This bucket cannot be created by Pulumi itself (it would need state to
# track its own state). It is the only AWS resource created outside of Pulumi.

$StateBucket = "TODO-REPLACE-BUCKET-NAME"
$AwsProfile  = "TODO-REPLACE-PROFILE"
$Region      = "us-east-2"

# ─────────────────────────────────────────────────────────────────────────────
# 1 - Create the bucket
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "Creating state bucket: $StateBucket in $Region ..." -ForegroundColor Cyan

aws s3api create-bucket `
    --bucket $StateBucket `
    --region $Region `
    --create-bucket-configuration LocationConstraint=$Region `
    --profile $AwsProfile

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create bucket. Check the name uniqueness and your credentials."
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 2 - Enable versioning
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "Enabling versioning ..." -ForegroundColor Cyan

aws s3api put-bucket-versioning `
    --bucket $StateBucket `
    --versioning-configuration Status=Enabled `
    --profile $AwsProfile

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to enable versioning."
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 3 - Block all public access
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "Blocking public access ..." -ForegroundColor Cyan

aws s3api put-public-access-block `
    --bucket $StateBucket `
    --public-access-block-configuration `
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" `
    --profile $AwsProfile

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to block public access."
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 4 - Enable Server-Side Encryption
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "Enabling server-side encryption ..." -ForegroundColor Cyan

aws s3api put-bucket-encryption `
    --bucket $StateBucket `
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' `
    --profile $AwsProfile

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to enable encryption."
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 5 - Verify
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`nVerifying bucket configuration ..." -ForegroundColor Cyan

Write-Host "`n[Versioning]"
aws s3api get-bucket-versioning --bucket $StateBucket --profile $AwsProfile

Write-Host "`n[Public Access Block]"
aws s3api get-public-access-block --bucket $StateBucket --profile $AwsProfile

Write-Host "`n[Encryption]"
aws s3api get-bucket-encryption --bucket $StateBucket --profile $AwsProfile

# ─────────────────────────────────────────────────────────────────────────────
# Step 6 - Login Pulumi to the S3 backend
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`nLogging Pulumi into S3 backend ..." -ForegroundColor Cyan

$env:AWS_PROFILE = $AwsProfile
pulumi login "s3://$StateBucket"

if ($LASTEXITCODE -ne 0) {
    Write-Error "pulumi login failed. Ensure the Pulumi CLI is installed (winget install pulumi)."
    exit 1
}

Write-Host "`n✅ Bootstrap complete." -ForegroundColor Green
Write-Host "   Bucket : $StateBucket"
Write-Host "   Region : $Region"
Write-Host "   Profile: $AwsProfile"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. cd infra"
Write-Host "  2. pulumi stack init dev"
Write-Host "  3. pulumi stack init prod"
Write-Host "  4. pulumi stack select dev && pulumi config set aws:region $Region"
Write-Host "  5. pulumi stack select prod && pulumi config set aws:region $Region"
