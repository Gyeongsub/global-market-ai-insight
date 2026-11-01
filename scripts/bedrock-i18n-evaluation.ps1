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
$locales = @(
    [ordered]@{ code = "en"; language = "English" },
    [ordered]@{ code = "ja"; language = "Japanese" },
    [ordered]@{ code = "ko"; language = "Korean" }
)
$maxOutputTokensPerInvocation = 512
$inputTokenSafetyLimitPerInvocation = 1500
$inputRatePerThousand = 0.000072
$outputRatePerThousand = 0.000288
$maximumEstimatedCostPerInvocationUsd = (($inputTokenSafetyLimitPerInvocation / 1000) * $inputRatePerThousand) + (($maxOutputTokensPerInvocation / 1000) * $outputRatePerThousand)
$maximumEstimatedCostUsd = $locales.Count * $maximumEstimatedCostPerInvocationUsd
$approvedKeys = @("summary", "observations", "opportunities", "risks", "specialConsiderations", "uncertainty")
$analysisToolName = "submit_market_analysis"

$fixturePath = Join-Path $PSScriptRoot "..\shared\test_fixtures\qld-quote.json"
$fixture = Get-Content -LiteralPath $fixturePath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($fixture.symbol -ne "QLD" -or $fixture.quote.symbol -ne "QLD") {
    throw "The bounded evaluation fixture must contain QLD only."
}
$assetCatalogPath = Join-Path $PSScriptRoot "..\shared\asset_catalog\assets.json"
$assetCatalog = Get-Content -LiteralPath $assetCatalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
$asset = @($assetCatalog.assets | Where-Object { $_.symbol -eq "QLD" })
if ($asset.Count -ne 1) { throw "The asset catalog must contain exactly one QLD entry." }

$facts = [ordered]@{
    symbol = $fixture.quote.symbol
    price = $fixture.quote.price
    currency = $fixture.quote.currency
    marketTimestamp = $fixture.quote.marketTimestamp
    retrievedAt = $fixture.quote.retrievedAt
    marketState = $fixture.quote.marketState
    freshness = $fixture.quote.freshness
    source = "local non-live contract fixture"
    verifiedAssetMetadata = [ordered]@{
        displayName = $asset[0].displayName
        type = $asset[0].type
    }
    change = $fixture.quote.change
    changePercent = $fixture.quote.changePercent
    constraints = @(
        "Explain that QLD targets 2x daily performance",
        "Explain compounding and path dependency",
        "Explain elevated downside risk",
        "Do not infer a cause or future direction from this fixture"
    )
}

function New-EvaluationRequest {
    param([Parameter(Mandatory)][string]$Language)

    $systemText = @"
You are an educational market explainer. Write all natural-language values in $Language. Call the $analysisToolName tool exactly once and do not return free-form text. Use exactly these keys: {"summary":string,"observations":string[],"opportunities":string[],"risks":string[],"specialConsiderations":string[],"uncertainty":string}. Do not add, rename, or omit keys. Keep summary and uncertainty at 240 characters or fewer each. Each array may contain at most 2 items; every item must be a non-empty string of 180 characters or fewer; risks must contain at least 1 item. Use only the supplied facts. State uncertainty and data limitations. The supplied quote contains no evidence of a specific opportunity, so opportunities must be an empty array. Never name a benchmark, index, issuer, sector, or investment objective unless that exact fact appears in the supplied facts. Do not claim that the instrument is suitable or unsuitable for a holding period. Do not use promotional phrases such as high returns, investment opportunity, or expected gains. Do not call fixture data current, latest, or real-time; use its explicit timestamps and source label. Do not provide personalized buy, sell, or hold instructions or guaranteed predictions. Omit any claimed driver that is not present in the supplied facts.
"@.Trim()

    $toolInputSchema = [ordered]@{
        type = "object"
        properties = [ordered]@{
            summary = @{ type = "string" }
            observations = @{ type = "array"; items = @{ type = "string" } }
            opportunities = @{ type = "array"; items = @{ type = "string" } }
            risks = @{ type = "array"; items = @{ type = "string" } }
            specialConsiderations = @{ type = "array"; items = @{ type = "string" } }
            uncertainty = @{ type = "string" }
        }
        required = $approvedKeys
    }

    return [ordered]@{
        modelId = $modelId
        system = @(@{ text = $systemText })
        messages = @(
            [ordered]@{
                role = "user"
                content = @(@{ text = ($facts | ConvertTo-Json -Depth 8 -Compress) })
            }
        )
        toolConfig = [ordered]@{
            tools = @(
                [ordered]@{
                    toolSpec = [ordered]@{
                        name = $analysisToolName
                        description = "Submit one grounded educational market analysis in the requested language."
                        inputSchema = @{ json = $toolInputSchema }
                    }
                }
            )
            toolChoice = @{ tool = @{ name = $analysisToolName } }
        }
        inferenceConfig = [ordered]@{
            maxTokens = $maxOutputTokensPerInvocation
            temperature = 0
            topP = 0.9
        }
    }
}

function Assert-StrictModelOutput {
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][ValidateSet("en", "ja", "ko")][string]$Locale
    )

    if ($Text.Length -gt 2400) { throw "Model output exceeds the raw response limit." }
    if ($Text.Contains('```')) { throw "Model output contains a Markdown code fence." }

    try {
        $value = $Text | ConvertFrom-Json -AsHashtable
    }
    catch {
        throw "Model output is not valid JSON."
    }
    if ($value -isnot [Collections.IDictionary]) { throw "Model output must be one JSON object." }

    $actualKeys = @($value.Keys | Sort-Object)
    $expectedKeys = @($approvedKeys | Sort-Object)
    if (($actualKeys -join "|") -ne ($expectedKeys -join "|")) {
        throw "Model output does not contain exactly the approved keys."
    }
    foreach ($field in @("summary", "uncertainty")) {
        if ($value[$field] -isnot [string] -or [string]::IsNullOrWhiteSpace($value[$field])) { throw "$field must be a non-empty string." }
        if ($value[$field].Length -gt 240) { throw "$field exceeds 240 characters." }
    }
    foreach ($field in @("observations", "opportunities", "risks", "specialConsiderations")) {
        if ($value[$field] -isnot [Collections.IList]) { throw "$field must be an array." }
        if ($value[$field].Count -gt 2) { throw "$field exceeds 2 items." }
        foreach ($item in $value[$field]) {
            if ($item -isnot [string] -or [string]::IsNullOrWhiteSpace($item) -or $item.Length -gt 180) {
                throw "$field contains an invalid item."
            }
        }
    }
    if ($value.risks.Count -lt 1) { throw "risks requires at least 1 item." }

    $combinedParts = [Collections.Generic.List[string]]::new()
    $combinedParts.Add([string]$value["summary"])
    foreach ($field in @("observations", "opportunities", "risks", "specialConsiderations")) {
        foreach ($item in $value[$field]) {
            $combinedParts.Add([string]$item)
        }
    }
    $combinedParts.Add([string]$value["uncertainty"])
    $combinedText = $combinedParts -join " "
    if ($combinedText -match '(?i)\b(buy|sell|hold)\s+(this|the|your)?\s*(stock|etf|position|now)\b') {
        throw "Model output contains prohibited trade-instruction phrasing."
    }
    if ($combinedText -match '(?i)guaranteed return|cannot lose|risk[- ]free') {
        throw "Model output contains a prohibited guarantee."
    }
    if ($combinedText -match '(?i)high returns?|investment opportunit(?:y|ies)|expected gains?|suitable for|not suitable for|高いリターン|高収益|投資機会|適して|向いて|고수익|투자 기회|적합|부적합') {
        throw "Model output contains unsupported promotional or suitability phrasing."
    }
    if ($value.opportunities.Count -ne 0) {
        throw "Quote-only evaluation requires an empty opportunities array."
    }
    if ($combinedText -match '(?i)NASDAQ|Nasdaq|S&P|Dow Jones|Russell|ナスダック|ダウ|러셀|나스닥|다우') {
        throw "Model output contains a benchmark or index that was not supplied."
    }
    if ($combinedText -match '(?i)current data|latest(?: available)? data|real[- ]time|最新(?:の)?(?:情報|データ)|リアルタイム|최신(?:\s*가용)?\s*(?:정보|데이터)|실시간') {
        throw "Model output mislabels the dated fixture as current or real-time."
    }
    if ($combinedText -notmatch '(?i)2x|2×|two.times|2倍|２倍|2배|２x') {
        throw "QLD model output is missing leveraged-product context."
    }
    if ($Locale -eq "ko" -and $combinedText -notmatch '[가-힣]') { throw "Korean output does not contain Hangul." }
    if ($Locale -eq "ja" -and $combinedText -notmatch '[ぁ-んァ-ヶ一-龯]') { throw "Japanese output does not contain Japanese script." }
    if ($Locale -eq "en" -and $combinedText -match '[가-힣ぁ-んァ-ヶ]') { throw "English output contains unexpected Korean or Japanese script." }

    return $value
}

$plan = [ordered]@{
    execute = [bool]$Execute
    profile = $Profile
    region = $Region
    modelId = $modelId
    locales = @($locales.code)
    invocations = $locales.Count
    automaticRetries = 0
    inputTokenSafetyLimitPerInvocation = $inputTokenSafetyLimitPerInvocation
    maxOutputTokensPerInvocation = $maxOutputTokensPerInvocation
    maximumEstimatedCostPerInvocationUsd = [math]::Round($maximumEstimatedCostPerInvocationUsd, 9)
    maximumEstimatedCostUsd = [math]::Round($maximumEstimatedCostUsd, 9)
    fixture = "shared/test_fixtures/qld-quote.json"
    fixtureIsLiveMarketData = $false
}

if (-not $Execute) {
    $plan | ConvertTo-Json -Depth 6
    return
}

$awsCommand = Get-Command aws.exe -ErrorAction SilentlyContinue
$awsExe = if ($awsCommand) { $awsCommand.Source } else { Join-Path $env:LOCALAPPDATA "Programs\Amazon\AWSCLIV2\aws.exe" }
if (-not (Test-Path -LiteralPath $awsExe)) { throw "AWS CLI was not found at the approved current-user installation path." }

$previousMaxAttempts = $env:AWS_MAX_ATTEMPTS
$previousRetryMode = $env:AWS_RETRY_MODE
$previousPythonUtf8 = $env:PYTHONUTF8
$previousConsoleOutputEncoding = [Console]::OutputEncoding
$previousOutputEncoding = $OutputEncoding
$results = @()
$totalCalculatedCostUsd = 0.0

try {
    $env:AWS_MAX_ATTEMPTS = "1"
    $env:AWS_RETRY_MODE = "standard"
    $env:PYTHONUTF8 = "1"
    $utf8 = [Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = $utf8
    $OutputEncoding = $utf8

    foreach ($locale in $locales) {
        $requestPath = Join-Path ([IO.Path]::GetTempPath()) ("gmai-bedrock-i18n-{0}-{1}.json" -f $locale.code, [guid]::NewGuid().ToString("N"))
        try {
            $request = New-EvaluationRequest -Language $locale.language
            [IO.File]::WriteAllText($requestPath, ($request | ConvertTo-Json -Depth 10), $utf8)
            $requestReference = "file://$($requestPath.Replace('\', '/'))"
            $rawOutput = & $awsExe bedrock-runtime converse --cli-input-json $requestReference --profile $Profile --region $Region --output json 2>&1
            if ($LASTEXITCODE -ne 0) { throw (($rawOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine) }

            $response = (($rawOutput | ForEach-Object { "$_" }) -join "`n") | ConvertFrom-Json
            $inputTokens = [int]$response.usage.inputTokens
            $outputTokens = [int]$response.usage.outputTokens
            $actualCostUsd = (($inputTokens / 1000) * $inputRatePerThousand) + (($outputTokens / 1000) * $outputRatePerThousand)
            $totalCalculatedCostUsd += $actualCostUsd

            $validationStatus = "PASSED"
            $validationError = $null
            $validatedOutput = $null
            try {
                $toolBlocks = @($response.output.message.content | Where-Object { $null -ne $_.toolUse })
                if ($toolBlocks.Count -ne 1) { throw "Response must contain exactly one toolUse block." }
                if ($toolBlocks[0].toolUse.name -ne $analysisToolName) { throw "Response used an unexpected tool." }
                $outputText = $toolBlocks[0].toolUse.input | ConvertTo-Json -Depth 10 -Compress
                $validatedOutput = Assert-StrictModelOutput -Text $outputText -Locale $locale.code
            }
            catch {
                $validationStatus = "FAILED"
                $validationError = $_.Exception.Message
            }

            $results += [ordered]@{
                locale = $locale.code
                callStatus = "SUCCEEDED"
                validationStatus = $validationStatus
                validationError = $validationError
                stopReason = $response.stopReason
                inputTokens = $inputTokens
                outputTokens = $outputTokens
                calculatedCostUsd = [math]::Round($actualCostUsd, 9)
                withinPerInvocationTokenBoundary = ($inputTokens -le $inputTokenSafetyLimitPerInvocation -and $outputTokens -le $maxOutputTokensPerInvocation)
                output = $validatedOutput
            }
        }
        catch {
            $results += [ordered]@{
                locale = $locale.code
                callStatus = "FAILED"
                validationStatus = "NOT_RUN"
                validationError = $_.Exception.Message
                inputTokens = $null
                outputTokens = $null
                calculatedCostUsd = $null
                withinPerInvocationTokenBoundary = $null
                output = $null
            }
        }
        finally {
            if (Test-Path -LiteralPath $requestPath) { Remove-Item -LiteralPath $requestPath -Force }
        }
    }

    [ordered]@{
        status = "COMPLETED"
        automaticRetries = 0
        successfulCalls = @($results | Where-Object { $_['callStatus'] -eq "SUCCEEDED" }).Count
        passedValidations = @($results | Where-Object { $_['validationStatus'] -eq "PASSED" }).Count
        withinApprovedCalculatedCostBoundary = ($totalCalculatedCostUsd -le $maximumEstimatedCostUsd)
        results = $results
        totalCalculatedCostUsd = [math]::Round($totalCalculatedCostUsd, 9)
    } | ConvertTo-Json -Depth 10
}
finally {
    $env:AWS_MAX_ATTEMPTS = $previousMaxAttempts
    $env:AWS_RETRY_MODE = $previousRetryMode
    $env:PYTHONUTF8 = $previousPythonUtf8
    [Console]::OutputEncoding = $previousConsoleOutputEncoding
    $OutputEncoding = $previousOutputEncoding
}
