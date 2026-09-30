# Fictional document library

Ten original, one-page PDFs cover the five business modules and the case handover. All names and facts are invented, with a conspicuous demonstration banner and no official signature or seal. Eight files belong to specific members; the policy and forecast PDFs are general presenter references.

| File | Member | Demonstration |
|---|---|---|
| [M002_appointment_letter.pdf](M002_appointment_letter.pdf) | M002 - Salim Al Harthy | Employer date 1992-07-01 conflicts with pension date 1992-06-01; preserve both sources. |
| [M003_service_certificate_request.pdf](M003_service_certificate_request.pdf) | M003 - Maryam Al Balushi | A request for one missing service certificate is not the certificate. |
| [M005_payment_comparison.pdf](M005_payment_comparison.pdf) | M005 - Fatma Al Amri | OMR 950 proposed minus OMR 650 supplied approval leaves OMR 300 unexplained. |
| [M006_payment_reconciliation.pdf](M006_payment_reconciliation.pdf) | M006 - Nasser Al Wahaibi | OMR 700 reconciles with OMR 650 plus OMR 50 supplied adjustment. |
| [M007_contribution_reconciliation.pdf](M007_contribution_reconciliation.pdf) | M007 - Huda Al Kindi | OMR 120 expected minus OMR 90 received leaves OMR 30 for reconciliation. |
| [M009_service_overlap_review.pdf](M009_service_overlap_review.pdf) | M009 - Aisha Al Maamari | Three overlap months are reported; underlying periods are not supplied. |
| [M010_unverified_service_request.pdf](M010_unverified_service_request.pdf) | M010 - Hamood Al Saadi | Six months await verification; unverified does not mean invalid. |
| [M002_case_handover.pdf](M002_case_handover.pdf) | M002 - Salim Al Harthy | Facts, open question and proposed review action; no actual case transition. |
| [DEMO_evidence_review_procedure.pdf](DEMO_evidence_review_procedure.pdf) | General reference | Fictional review procedure. Download/open; no automatic policy-PDF ingestion or publication. |
| [DEMO_workforce_count_brief.pdf](DEMO_workforce_count_brief.pdf) | General reference | Static checkpoint for the live count projection: 2026-09-25, 36 months, +12 months, baseline 3 versus scenario 2 from twelve members. |

`manifest.json` is the single authoritative metadata catalog used by the authenticated development-only sample API and UI. It is an implementation asset; business users choose files in **Demo center** or the document page rather than editing the JSON. Fixed manifest IDs select download files. Samples are not served by those routes in production.

In **Case & documents**, expand **Use a sample PDF for the client demonstration**, filter the module and select **Use sample in upload**. This prepares the member, title and browser file. Confirm all three, then click **Upload & queue extraction**. General references have no member and are download-only. Alternatively download a PDF and use **Add a case document** with the matching member selected.

Run the worker with a configured OpenAI provider to extract the document. Refresh until processing finishes; inspect the original and every proposed field. Sign in as a different `reviewer` to correct and verify fields, resolve uncertainty and check quoted evidence. The uploader cannot verify their own upload. No extracted result is embedded or pre-approved in these files. Model field names may vary; verify dates, units, source labels, page references and quotes rather than expecting exact model wording.

Verification records evidence in Pension360. It does not overwrite REST facts, approve a pension, authorize a payment, resolve a case or settle a source conflict automatically. M003's REST fixture reports a missing count only; its request PDF supplies the illustrative certificate name and must never be relabeled as the certificate itself.

The forecast brief is static rehearsal material; use the server-calculated result and current settings as live evidence. The policy PDF is a reference, while actual Copilot guidance comes from independently published text procedures. Real pension/ERP files can enter through the existing manual upload or authenticated upload API. Automatic document-repository ingestion, bulk history import and roster synchronization require a separate reviewed connector.

Without a configured provider and running worker, show the honest job state and demonstrate originals and deterministic decision evidence. The [functional consultant guide](../docs/FUNCTIONAL_CONSULTANT_DEMO.html) contains role navigation, the client route and live rule exercises; the [Copilot playbook](../docs/DEMO_PLAYBOOK.html) provides additional questions.

Regenerate the same text-only samples with Node.js built-ins:

```text
node demo-data/generate-samples.mjs
```
