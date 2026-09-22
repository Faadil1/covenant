# COVENANT — Customer Discovery Guide

## Objective

Do not pitch COVENANT first.

Discover whether teams already experience a repeated, costly problem around:

- maintaining an economic mandate across changing instruments/representations;
- rights / wrapper / custody / liquidity drift;
- agent delegation;
- pre-execution controls;
- representation replacement;
- lifecycle handling.

## Target interviewees

Priority order:

1. RWA / tokenized-asset platform product or operations lead;
2. institutional digital-asset treasury lead;
3. custodian / wallet governance product lead;
4. asset manager / portfolio compliance or operations lead;
5. collateral / repo / liquidity infrastructure product lead;
6. financial-agent infrastructure founder/product lead.

## 30-minute interview

### Context

1. What types of tokenized or digitally represented assets do you currently support or expect to support?
2. How many issuers, wrappers, chains, custodians and execution venues are involved?
3. Who owns the responsibility for deciding whether a specific representation is acceptable?

### Current pain

4. Tell me about the last time an asset/representation became unsuitable because of liquidity, issuer, rights, jurisdiction, custody, redemption, compliance or lifecycle changes.
5. How was that detected?
6. What happened operationally after detection?
7. Was the response automated, manual, or committee-driven?
8. What is the cost of getting that decision wrong?

### Mandate continuity

9. Do you think internally in terms of exact instruments, or in terms of target economic exposure / mandate / eligibility?
10. If two instruments provide similar exposure but different legal/economic rights, where is that distinction encoded today?
11. How do you decide whether replacing instrument A with B preserves the original mandate?
12. Which facts would have to be proven before you would allow software to make that change?

### Agent authority

13. Are you experimenting with agents or automated systems that can initiate financial actions?
14. What can they do without human approval today?
15. What prevents an agent from taking an action that is technically permitted but economically outside the intended mandate?
16. Would a proof of the exact proposed post-state change your approval model? Why or why not?

### Workflow / budget

17. Which systems handle this today: OMS, compliance engine, wallet policy engine, spreadsheets, operations staff, legal review, risk system?
18. Is this problem owned by one team or spread across teams?
19. What budget already pays for the current controls?
20. If this workflow were materially improved, would you buy it as infrastructure, expect it inside an incumbent platform, or build it internally?

### Design-partner close

21. Could you give us one anonymized real workflow where a representation becomes invalid or must be replaced?
22. Could we model that workflow against your current controls?
23. If a prototype demonstrated the workflow end-to-end, who else would need to evaluate it?
24. What would have to be true for a paid pilot?

## Anti-leading rule

Do not ask:

> “Would you use a product that preserves economic intent?”

Ask for the **last concrete incident/workflow** first.

Do not count “cool idea” as validation.

## Evidence scoring

Record each interview as:

- recurring pain: yes/no;
- quantified consequence: yes/no;
- current workaround/system;
- decision owner;
- budget owner;
- automation desired: yes/no;
- representation substitution exists: yes/no;
- proof/audit requirement exists: yes/no;
- design-partner interest: yes/no;
- paid-pilot path: yes/no.

## Gate thresholds

Do not call the problem commercially validated until:

- 10–15 qualified interviews completed;
- 5+ independently describe the core pain;
- 3+ provide concrete current workflows/costs;
- 2+ agree to design-partner work;
- 1+ has a credible paid-pilot path.
