#requires -Version 7.0

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$null = . (Join-Path $PSScriptRoot "bedrock-i18n-evaluation.ps1")

$samples = [ordered]@{
    en = '{"summary":"QLD targets 2x daily performance.","observations":["This is a dated fixture."],"opportunities":[],"risks":["Losses can be amplified."],"specialConsiderations":["Compounding creates path dependency."],"uncertainty":"Future direction is unknown."}'
    ja = '{"summary":"QLDは日次で2倍を目指します。","observations":["過去のデータです。"],"opportunities":[],"risks":["損失も拡大します。"],"specialConsiderations":["複利と経路依存性があります。"],"uncertainty":"将来は不明です。"}'
    ko = '{"summary":"QLD는 일일 2배를 목표로 합니다.","observations":["과거 자료입니다."],"opportunities":[],"risks":["손실도 확대됩니다."],"specialConsiderations":["복리와 경로 의존성이 있습니다."],"uncertainty":"미래는 불확실합니다."}'
}

foreach ($code in @("en", "ja", "ko")) {
    $null = Assert-StrictModelOutput -Text $samples[$code] -Locale $code
}

$unsafeKorean = '{"summary":"QLD는 2배 일일 성과를 목표하는 레버리지 상장지수 펀드입니다.","observations":["가격은 상승했습니다."],"opportunities":[],"risks":["하락 시 손실이 커질 수 있습니다."],"specialConsiderations":["단기간의 상승 추세에 효과적일 수 있습니다.","장기적인 투자에는 적합하지 않을 수 있습니다."],"uncertainty":"미래는 불확실합니다."}'
$unsafeKoreanRejected = $false
try {
    $null = Assert-StrictModelOutput -Text $unsafeKorean -Locale "ko"
}
catch {
    if ($_.Exception.Message -match "promotional or suitability") {
        $unsafeKoreanRejected = $true
    }
    else {
        throw
    }
}
if (-not $unsafeKoreanRejected) {
    throw "The validator failed to reject Korean promotional or suitability phrasing."
}

$request = New-EvaluationRequest -Language "English"
if ($request.toolConfig.toolChoice.tool.name -ne "submit_market_analysis") {
    throw "The analysis tool must be explicitly selected."
}
if ($request.toolConfig.tools.Count -ne 1) {
    throw "Exactly one analysis tool must be configured."
}
$toolSchema = $request.toolConfig.tools[0].toolSpec.inputSchema.json
if (($toolSchema.Keys -join "|") -ne "type|properties|required") {
    throw "The Nova v1 tool schema contains unsupported top-level fields."
}
if (($toolSchema.required -join "|") -ne "summary|observations|opportunities|risks|specialConsiderations|uncertainty") {
    throw "The tool schema required fields are not aligned."
}

$totalCalculatedCostUsd = 0.0
foreach ($cost in @(0.0001, 0.0002, 0.0003)) {
    $totalCalculatedCostUsd += $cost
}
if ([math]::Abs($totalCalculatedCostUsd - 0.0006) -gt 0.000000001) {
    throw "Incremental cost aggregation failed."
}

Write-Output "LOCAL_I18N_EVALUATION_SELF_TEST=PASSED"
