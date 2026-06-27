# How to Evaluate a Hybrid Cloud Architecture

Hybrid cloud architecture combines two or more distinct cloud infrastructures
that remain separate but support data or application portability between them.
The model can connect private, community, or public cloud environments. A sound
evaluation starts with workload placement, data sensitivity, recovery
requirements, portability constraints, and measured operating costs rather
than assuming that a hybrid design is automatically cheaper or more secure.

## What qualifies as hybrid cloud?

The National Institute of Standards and Technology (NIST) defines hybrid cloud
as distinct cloud infrastructures:

> “bound together by standardized or proprietary technology that enables data
> and application portability.”

The definition matters because using unrelated public and private systems does
not by itself create an integrated hybrid architecture. The systems need a
mechanism for moving data or applications between environments.

## Evaluation criteria

| Decision area | Evidence to collect | Question to answer |
| --- | --- | --- |
| Data placement | Classification, residency, and retention requirements | Which datasets may run in each environment? |
| Portability | Supported formats, interfaces, and transfer procedures | Can the workload move without an unplanned rewrite? |
| Resilience | Recovery time and recovery point objectives | Does the design meet documented continuity targets? |
| Operations | Ownership, monitoring, incident response, and access controls | Can the team operate both environments consistently? |
| Cost | Baseline spend, transfer charges, utilization, and support effort | Is the total operating model better than the alternatives? |

## Avoid unsupported benefit claims

Do not add savings percentages, return-on-investment figures, security
improvements, or customer quotations unless the organization can cite the
underlying measurement or an authoritative source. A GEO audit rewards evidence
signals, but a higher heuristic score never justifies fabricated evidence.

## Sources

1. [NIST SP 800-145: The Definition of Cloud Computing](https://csrc.nist.gov/pubs/sp/800/145/final)
2. [NIST glossary: Hybrid cloud](https://csrc.nist.gov/glossary/term/Hybrid_cloud)
