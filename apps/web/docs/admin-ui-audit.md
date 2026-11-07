# Admin frontend design audit

Reference: https://velapal-workspace.arkandaffa0105.chatgpt.site (Admin demo, inspected through its visible navigation).

The original Admin has ten destinations. The implementation previously exposed only Overview, Disputes and Audit logs. These screens and interactions now follow the reference:

| Original destination | Local route | Implemented frontend behavior |
| --- | --- | --- |
| Overview | `/workspace` | Account/review/dispute/AI summary links, review queue, operational boundaries, recent local activity |
| Users | `/workspace/admin/users` | Name/email search, status filter, suspend/restore review dialog, staff-account restrictions |
| Merchants | `/workspace/admin/merchants` | Search/filter, business detail dialog, reasoned approval/rejection |
| Transactions | `/workspace/admin/transactions` | Fixture transaction table, reference search, status filter, CSV export |
| Dispute Monitoring | `/workspace/admin` | Stable counts, five filter tabs, search, assigned-to-me, refresh, existing case investigation |
| AI monitoring | `/workspace/admin/ai` | Five logical role cards, scoped illustrative traces, pause/resume preview |
| Analytics & reports | `/workspace/admin/analytics` | Dataset counts, merchant application funnel, CSV report |
| Audit logs | `/workspace/admin/audit` | Search, role filter, local decision records plus official API events, CSV export |
| Roles & permissions | `/workspace/admin/roles` | Permission matrix, bounded read-only staff grants, exact-scope confirmation |
| Settings | `/workspace/admin/settings` | Internal invitation preview, proposed security policy, sample-session revocation, expiry preview, actual sign-out, local reset |

Investigation follows the reference's Overview / Evidence / Mediation / Activity tabs and two-column content / supervisor controls layout. Existing official assignment, shared-evidence access restrictions, assessment, scoped approval, control-version checks and real mock MFA calls remain in place. Unassigned investigators see metadata rather than shared or private sources.

New Admin administration controls are frontend-only simulations because their production endpoints have not been specified. Records use a browser-tab store scoped to the signed-in Admin user and workspace. Reason, demo code `123456`, explicit review and a local audit record accompany mutations. These operations never modify actual authentication, server permissions, provider state or API agent execution. In API mode, these previews display an unavailable integration notice rather than invent endpoints. Existing dispute, authentication, approval and audit API services remain unchanged.

No public Admin registration, no email delivery, no raw private prompts in AI monitoring, and no financial executor are added. The preview's reset affects only the local Admin records; it does not clear API dispute records or sign the user out. Actual sign-out continues through the existing session service.

Reference captures and local comparison screenshots are in ignored `.visual-audit/`. Automated browser coverage checks all menus and dialog dismissal at 360, 390, 768 and 1440 pixels, local decision persistence and audit visibility, filtering, exports, invitations, reset, and the existing three-party dispute workflow.
