# ADR 0010: Persistent admission circuit and fixed capacity slots

Date: 2026-09-06. Status: accepted, deployed and bounded live admission verified on 2026-09-07.

## Problem

A per-minute limit is not a concurrent-task limit: slow tasks can accumulate across minute boundaries. An environment-only circuit also cannot provide a versioned, shared operational switch. Before enabling live controller jobs, prepare both controls in the existing jobs table, without adding a service or schedule.

## Decision

- Admission atomically writes the job, checks the CLOSED circuit/version, claims one of two exact slot keys, and increments the minute counter. Only confirmed slot contention may try the other slot; uncertain failures never trigger blind launch retries.
- Missing, invalid, TTL-bearing or unreadable circuit records fail OPEN. Environment OPEN takes precedence. Opening the circuit stops new admissions, not already admitted work.
- Slots never expire automatically. Release requires a matching terminal job, creation time, version and task ARN, actual ECS `lastStatus=STOPPED`, then a conditional job-check/slot-delete transaction.
- Lost launch responses, missing task ARNs, expired jobs, unavailable ECS evidence and conflicting ownership retain capacity. A reviewed manual recovery remains necessary for these cases. The reconciler is a library, not a deployed scheduled sweeper.
- All occupied slots must be drained before changing their configured count. Administrator-direct ECS calls are outside the controller cap.

## IAM correction and isolation

The prior controller policy incorrectly named `dynamodb:TransactWriteItems` as an IAM action. DynamoDB transactions require permissions for their constituent actions. Replace that entry with narrowly scoped PutItem, UpdateItem and ConditionCheckItem permissions; constrain transaction-only grants with `dynamodb:EnclosingOperation` and exact/prefixed `dynamodb:LeadingKeys`.

Controller circuit reads/checks are permitted, but circuit writes and slot deletion are not. Worker reads/updates are limited to job key prefixes, excluding all control records. Resource ARNs remain scoped to the project table. The deployed policy passed Access Analyzer and 11 intended simulator decisions. The simulator did not match `ConditionCheckItem`, so it was initially left unproved. The approved signed PRICE acceptance on 2026-09-07 subsequently exercised the real admission transaction, occupied one slot, launched one task, reached `SUCCEEDED` and released the exact slot after STOPPED evidence. This is one bounded runtime proof, not a substitute for all negative/race scenarios.

References: [AWS transaction IAM permissions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html), [ECS task lifecycle](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-lifecycle-explanation.html).

## Consequences and remaining gates

Safety deliberately takes priority over availability. A Lambda timeout after reservation can leave a retained slot. No latency SLO, account-wide task cap or hard dollar cap is claimed. Circuit OPEN initialization and one signed HTTP admission succeeded, and the session ended with internal jobs false, OPEN and zero tasks/slots. The separately reviewed operations role, scheduled stale-job recovery and Phase 11 alarm-driven circuit drill remain unfinished. Provider job/display flags stay false outside separately approved acceptances. See the [signed acceptance evidence](../evidence/PHASE7_SIGNED_API_ACCEPTANCE_2026-09-07.md).
