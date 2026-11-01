# Global Market AI Insight AWS Least Privilege Analysis Portfolio

As of November 1, 2026. Language versions: [한국어](PORTFOLIO_CASE_STUDY_KO.md) · [日本語](PORTFOLIO_CASE_STUDY_JA.md).

The source, tests, learning materials and Korean portfolio were published on
[GitHub](https://github.com/Gyeongsub/global-market-ai-insight) after security review
and owner approval. All 841 files in initial commit
`db02fa4b61061c12cb7820b80eb2dfb8234d0486` were downloaded again and verified against
the reviewed candidate. The subsequent completion-status update changed documents,
not executable code. This English edition translates that portfolio.
Historical evidence and deferred experiments retain
their original scope. The owner's hands-on exercises follow publication separately.

## Project in one sentence

A multilingual local tool for preparing market-research questions, paired with an
owner-only lab that analyzes synthetic data on real Amazon Bedrock, designed around
least privilege, time limits, cost controls and verified resource cleanup.

## Original problem and scope change

The original goal was to connect an external market-data API, event-driven AWS
processing and AI analysis in one service. Beyond implementation, this required
separate reviews of rights to retrieve, display, submit to AI and redistribute
data, as well as account-registration disclosures and usage-based charges.

To preserve the learning goal without uncertain contracts or additional accounts,
the functionality was split. Users research current information directly in their
existing ChatGPT interface. AWS exercises use a fixed, clearly labeled synthetic
QLD dataset. The project does not present invented values as actual quotes or
claim that market-data licensing has been resolved.

## Two working paths

| Path | User experience | AWS and cost boundary |
| --- | --- | --- |
| Search-question companion | Select a symbol, language and question type → manually copy and send → read the answer in ChatGPT | The app makes no AWS or search-API calls. ChatGPT terms and usage limits are separate |
| Real synthetic-analysis lab | Start the validated temporary broker → run one analysis in the browser → inspect the result → shut down | A temporary model-only role invokes Tokyo Nova Lite. No retries, a 512-token output cap and an authorization window of at most five minutes |

The earlier API Gateway, Lambda, DynamoDB, ECS and Fargate code is retained as a
separate learning architecture. The current browser analysis does not traverse
that entire asynchronous path. Its operating policy keeps provider execution and
display disabled and the circuit OPEN. Actual state is established only at the
time of each recorded check and must be checked again before a new execution.

## What AWS does

AWS is not the search engine or web host for the current product. It is the
execution environment for **bounded real AI analysis and least-privilege operations**.
Question generation stays on the PC. Bedrock receives a request only when the
synthetic-analysis lab is explicitly started and an analysis is requested.

```text
Search-question companion
  Local page → copy question → user sends it to ChatGPT → read in ChatGPT

Real AWS synthetic analysis
  Owner authentication → temporary model-only role → short-lived STS credentials
                                                     (never sent to the browser)
  Local page → bounded broker → Bedrock Nova Lite → validate result → display
                       ↓
  End session → clear credentials → verify role and stack deletion
```

| Component | Responsibility in this project | Alternative not selected and why |
| --- | --- | --- |
| Local page and broker | Requests and results on the owner's PC; AWS credentials remain server-side | Public hosting would add domain, authentication and operational scope |
| IAM roles and STS | Grant narrowly scoped analysis permissions temporarily | Administrator credentials are not passed to the browser or inference SDK |
| Amazon Bedrock | Select bounded analysis items from fixed synthetic evidence | The exercise needs no additional stock-data account or rights to actual financial data |
| AWS CDK and CloudFormation | Define and manage the temporary role and retained learning architecture as code | Changes and cleanup are easier to trace than accumulated console-only edits |
| API Gateway, Lambda, DynamoDB and Fargate | Preserve earlier exercises in asynchronous jobs, deduplication and state transitions | These are not represented as required components of the current direct Bedrock path |

In the retained architecture, DynamoDB manages job state and conditional
transitions; Fargate runs a container for each job rather than maintaining a
long-running service. The current analysis button does not execute that architecture.

## Key design lessons

1. **Separate authentication from authorization.** The owner's CLI login manages
   infrastructure. The inference SDK receives separate model-only STS credentials.
   No AWS keys reach the browser.
2. **State each control's scope.** A 15-minute STS credential lifetime, a five-minute
   absolute authorization window in the session policy and one application-level
   model attempt are distinct controls. Restarting creates a new allowance.
3. **Test denials as well as successes.** Bounded tests checked an allowed model
   invocation, explicit denial after expiry, denial for another role and denial
   of ECS execution. They do not constitute exhaustive verification of all permissions.
4. **Treat model output as untrusted.** The model selects only allowed insight IDs
   from fixed evidence. The app validates the schema, token usage and required
   risk wording before displaying localized sentences.
5. **Make shutdown part of the feature.** A CLOSED page state, stopped local
   listener, cleared credentials, deleted temporary role and stack, and independent
   checks for remaining resources are separate conditions.

## Verified results

- The final public candidate passed 90 steps and 1,905 tests, with one existing
  skip, after an independent Git clone and fresh installation using the frozen
  lockfile. A fresh clone from GitHub matched the candidate byte for byte. These
  results are not remote CI runs or new AWS invocations.
- The October 31 restricted-role browser revision passed 90 steps and 1,874 tests,
  with one existing skip, in both the current installation and an isolated fresh
  installation of the same source.
- An earlier November 1 follow-up passed 90 steps and 1,897 tests, with one existing
  skip. A plan-document change between the current and fresh installations produced
  different source hashes. Those counts are not same-hash proof for the final candidate.
- On October 31, one English synthetic QLD analysis ran through the restricted-role
  browser path, using 895 input tokens and 93 output tokens. Refreshing the result
  and reloading the page caused no additional model request. The estimate using
  the rates at that time was USD 0.000091224, not a finalized billing amount.
- After shutdown, independent queries verified deletion of the temporary role and
  stack and zero running/pending project tasks, services and occupied slots. This
  does not mean that retained storage incurred zero cost.
- The exact cause of one local service-test failure remains unknown. Later independent
  runs passed, but the failed result was retained and its cause was not presented as known.

See the [browser verification evidence](evidence/SYNTHETIC_RESTRICTED_BROWSER_2026-10-31.md)
for the precise scope.

## Security and cost controls

The single-attempt limit addresses unexpected repeated calls as well as model-output
quality. Failed attempts count toward the limit, and SDK retries are disabled.
The output-token cap limits response size; it is not an account-wide spending cap
covering input tokens, other services or newly started sessions.

| Control | Problem addressed | Remaining limitation |
| --- | --- | --- |
| 127.0.0.1-only access and request validation | LAN exposure and unintended browser requests | Does not make a malware-infected PC trustworthy |
| Fixed model, Region and synthetic input | Other-model use and transmission of sensitive free-form input | Narrow functionality, not a general investment-analysis service |
| Model-only role | Restricts the inference process's secret-reading and compute-execution permissions | The owner's separate management identity may have other permissions |
| Five-minute authorization, 15-minute STS credentials, one app attempt | Prolonged access and repeated requests | Deleting a role does not imply immediate revocation of every issued session |
| Validated insight IDs and localized sentences | Direct display of arbitrary model prose or HTML | Results concern a limited synthetic case, not a general guarantee of factual accuracy |
| Independent post-shutdown queries | Reliance on cleanup commands' success messages alone | Does not prove removal of out-of-scope resources or delayed charges |

The USD 5 monthly budget alert is a notification, not a hard cutoff. Retained S3,
ECR, DynamoDB and log storage may incur charges even when the lab is idle. The
goal is not “always free,” but **operations with explicit execution boundaries,
residual-cost awareness and verified shutdown**.

## Problem-solving examples

**Market-data usage rights.** A successful API connection does not establish the
right to display data or submit it to AI. Rather than create more free-provider
accounts, the project separated user-led research in ChatGPT from synthetic inputs
to AWS. Requirements and operating constraints took precedence over connectivity.

**Model invocation and response handling.** An actual request failure was addressed
through local compatibility review and bounded revalidation. Successful-response
usage, request counts after refresh and denial after the authorization window were
checked separately. One successful request does not prove that the entire IAM
policy is safe in every situation. See
[compatibility and expiry verification](evidence/SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md).

**Development-dependency advisory.** An October 31 query matched one moderate
advisory against two development versions of minimatch. There were no matches in
declared runtime dependencies, but this was not described as “no vulnerabilities.”
Fixed lint inputs and time/memory limits mitigate risk; they are not a patch. On
November 1, a compatible backport based on the official fix was applied to both
module formats of 10.2.6. The full local check then passed 90 steps and 1,905 tests,
with one existing skip. The original version-range advisory and the review of the
different 3.1.5 implementation remain documented. Independent reproduction of the
public copy and the final release-risk decision are separate checks. See the
[patch record](evidence/MINIMATCH_BACKPORT_2026-11-01.md) and
[advisory review](evidence/LINT_ADVISORY_REVIEW_2026-10-31.md).

## Claims this project does not make

This is not a real-time stock-price service, investment-advice service, public-user
authentication system, unconditional spending cap or guarantee of immediate billing
cessation under every failure. The new restricted-role path has one real English
analysis verification, separate from earlier tests in other languages. Remote CI
is not configured. Privacy, rights and single-initial-history review of the public
source candidate, plus remote-clone matching, are complete. This does not complete
license/security review for distributing containers or build artifacts, or every
historical AWS experiment.

The project was implemented and verified with AI assistance. Actions performed
personally by the owner must be distinguished from AI-assisted implementation;
exercises not yet performed personally should not be presented as hands-on
experience. The [Korean learning guide](API_INTEGRATION_LEARNING_GUIDE_KO.md) provides
code-tracing and explanation questions to assess understanding of the architecture
and operational decisions.

## Reading and practice sequence

Hands-on exercises follow publication. Reading alone does not establish operational
proficiency, but connecting design decisions to code makes the purpose of each
action clearer. The first reading requires neither AWS login nor paid model calls.

1. Use the [current plan](../plan.md) to distinguish the two active paths from the
   retained learning architecture.
2. Trace requests, data and authentication in the [architecture](architecture.md).
   Explain why the browser receives no AWS keys.
3. Read the [Korean API and AWS guide](API_INTEGRATION_LEARNING_GUIDE_KO.md) to connect
   the earlier API integration, current synthetic lab, IAM, STS and cost controls.
4. Read the start and stop conditions in the
   [synthetic-lab runbook](runbooks/synthetic-bedrock-lab.md) before execution.
   Actual runs require fresh authentication, cost and safety checks.
5. In the [verification map](PRIVATE_PORTFOLIO_STATUS.md), distinguish successes,
   denials, failures and unverified cases. Record an exercise as personal experience
   only after reproducing it yourself.

### Questions to be able to explain

- Why choose a local broker instead of a public server, and what was traded away?
- How do credential lifetime, authorization window and application call count differ?
- Why is Fargate not in the current analysis button's execution path?
- Where should requests be restricted to limit cost before an alert arrives?
- Beyond a successful response, what denial and cleanup evidence supports a safe lab?

These are a checklist for self-directed learning and interviews after publication,
not owner exercises required before release. Linked supporting documents retain
their existing languages; this edition does not translate the entire documentation set.

## Five-minute presentation sequence

1. Explain why extra accounts, market-data rights and cost led to the split in scope.
2. Show the generated question and source requirements without sending it automatically.
3. Use existing records or screenshots to explain real AWS analysis and the
   least-privilege path without incurring a new model charge for every demonstration.
4. Show denial tests and shutdown evidence, distinguishing alerts, permissions,
   request counts and credential lifetimes.
5. Separate the completed scope from
   [deferred extensions and exercises](PRIVATE_PORTFOLIO_STATUS.md).
