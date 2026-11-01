#requires -Version 7.0

[CmdletBinding()]
param(
    [switch]$Execute,
    [string]$Profile = "gmai-admin",
    [string]$Region = "ap-northeast-1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$modelId = "amazon.nova-lite-v1:0"
$maxOutputTokens = 256
$inputTokenSafetyLimit = 1000
$inputRatePerThousand = 0.000072
$outputRatePerThousand = 0.000288
$maximumEstimatedCostUsd = (($inputTokenSafetyLimit / 1000) * $inputRatePerThousand) + (($maxOutputTokens / 1000) * $outputRatePerThousand)

$fixturePath = Join-Path $PSScriptRoot "..\shared\test_fixtures\qld-quote.json"
$fixture = Get-Content -LiteralPath $fixturePath -Raw | ConvertFrom-Json
if ($fixture.symbol -ne "QLD" -or $fixture.quote.symbol -ne "QLD") {
    throw "The bounded smoke fixture must contain QLD only."
}

$systemText = @"
You are an educational market explainer. Use only supplied facts. Return exactly one valid JSON object in Korean with the keys summary, observations, risks, and uncertainty. Do not provide personalized buy, sell, or hold instructions or guaranteed predictions.
"@.Trim()

$facts = [ordered]@{
    symbol = $fixture.quote.symbol
    price = $fixture.quote.price
    currency = $fixture.quote.currency
    marketTimestamp = $fixture.quote.marketTimestamp
    retrievedAt = $fixture.quote.retrievedAt
    marketState = $fixture.quote.marketState
    source = "local non-live contract fixture"
    constraints = @(
        "Explain that QLD targets 2x daily performance",
        "Explain compounding and path dependency",
        "Explain elevated downside risk",
        "Do not infer a cause or future direction from this fixture"
    )
}

$request = [ordered]@{
    modelId = $modelId
    system = @(@{ text = $systemText })
    messages = @(
        [ordered]@{
            role = "user"
            content = @(@{ text = ($facts | ConvertTo-Json -Depth 8 -Compress) })
        }
    )
    inferenceConfig = [ordered]@{
        maxTokens = $maxOutputTokens
        temperature = 0
        topP = 0.9
    }
}

$plan = [ordered]@{
    execute = [bool]$Execute
    profile = $Profile
    region = $Region
    modelId = $modelId
    invocations = 1
    automaticRetries = 0
    inputTokenSafetyLimit = $inputTokenSafetyLimit
    maxOutputTokens = $maxOutputTokens
    maximumEstimatedCostUsd = [math]::Round($maximumEstimatedCostUsd, 9)
    fixture = "shared/test_fixtures/qld-quote.json"
}

if (-not $Execute) {
    $plan | ConvertTo-Json -Depth 5
    return
}

$awsCommand = Get-Command aws.exe -ErrorAction SilentlyContinue
$awsExe = if ($awsCommand) {
    $awsCommand.Source
}
else {
    Join-Path $env:LOCALAPPDATA "Programs\Amazon\AWSCLIV2\aws.exe"
}
if (-not (Test-Path -LiteralPath $awsExe)) {
    throw "AWS CLI was not found at the approved current-user installation path."
}

$requestPath = Join-Path ([IO.Path]::GetTempPath()) ("gmai-bedrock-smoke-{0}.json" -f [guid]::NewGuid().ToString("N"))
$previousMaxAttempts = $env:AWS_MAX_ATTEMPTS
$previousRetryMode = $env:AWS_RETRY_MODE
$previousPythonUtf8 = $env:PYTHONUTF8
$previousConsoleOutputEncoding = [Console]::OutputEncoding
$previousOutputEncoding = $OutputEncoding

try {
    $utf8WithoutBom = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($requestPath, ($request | ConvertTo-Json -Depth 10), $utf8WithoutBom)
    $requestReference = "file://$($requestPath.Replace('\', '/'))"

    $env:AWS_MAX_ATTEMPTS = "1"
    $env:AWS_RETRY_MODE = "standard"
    $env:PYTHONUTF8 = "1"
    $utf8Console = [Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = $utf8Console
    $OutputEncoding = $utf8Console

    $rawOutput = & $awsExe bedrock-runtime converse `
        --cli-input-json $requestReference `
        --profile $Profile `
        --region $Region `
        --output json 2>&1

    if ($LASTEXITCODE -ne 0) {
        throw (($rawOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine)
    }

    $response = (($rawOutput | ForEach-Object { "$_" }) -join "`n") | ConvertFrom-Json
    $inputTokens = [int]$response.usage.inputTokens
    $outputTokens = [int]$response.usage.outputTokens
    $actualCostUsd = (($inputTokens / 1000) * $inputRatePerThousand) + (($outputTokens / 1000) * $outputRatePerThousand)

    [ordered]@{
        status = "SUCCEEDED"
        modelId = $modelId
        stopReason = $response.stopReason
        inputTokens = $inputTokens
        outputTokens = $outputTokens
        totalTokens = [int]$response.usage.totalTokens
        calculatedCostUsd = [math]::Round($actualCostUsd, 9)
        outputText = $response.output.message.content[0].text
    } | ConvertTo-Json -Depth 8
}
finally {
    if (Test-Path -LiteralPath $requestPath) {
        Remove-Item -LiteralPath $requestPath -Force
    }
    $env:AWS_MAX_ATTEMPTS = $previousMaxAttempts
    $env:AWS_RETRY_MODE = $previousRetryMode
    $env:PYTHONUTF8 = $previousPythonUtf8
    [Console]::OutputEncoding = $previousConsoleOutputEncoding
    $OutputEncoding = $previousOutputEncoding
}
