# Plans

Implementation plans live **only** here. Numbered `NNN-short-name.md`.

| Plan | Status |
|------|--------|
| [000-workspace-setup.md](000-workspace-setup.md) | Done |
| [001-research-and-specs.md](001-research-and-specs.md) | Done |
| [002-rule-model-engine-core.md](002-rule-model-engine-core.md) | Done (manual browser check pending) |
| [003-workspace-ui-popup.md](003-workspace-ui-popup.md) | Done |
| [004-workspace-ui-editor.md](004-workspace-ui-editor.md) | Done |
| [005-page-inject-api-mock.md](005-page-inject-api-mock.md) | Done |
| [006-workspace-ui-rule-tester.md](006-workspace-ui-rule-tester.md) | Done |
| [007-workspace-ui-remainder.md](007-workspace-ui-remainder.md) | Done |
| [008-engine-deep-body.md](008-engine-deep-body.md) | Done |
| [009-observability-badge-log.md](009-observability-badge-log.md) | Done |
| [010-distribution-ci-packaging.md](010-distribution-ci-packaging.md) | Done |
| [011-local-bridge.md](011-local-bridge.md) | Done |
| [012-local-bridge-inplace.md](012-local-bridge-inplace.md) | Done |
| [013-sri-handling.md](013-sri-handling.md) | Done |
| [014-sri-page-integrity.md](014-sri-page-integrity.md) | Done |
| [015-sri-markup-integrity.md](015-sri-markup-integrity.md) | Done |
| [016-sri-script-markup.md](016-sri-script-markup.md) | Done |
| [017-sri-inert-markup.md](017-sri-inert-markup.md) | Done |
| [018-sri-unsafe-html-scripts-off.md](018-sri-unsafe-html-scripts-off.md) | Done |
| [019-sri-parse-html-unsafe.md](019-sri-parse-html-unsafe.md) | Done |
| [020-sri-attribute-node.md](020-sri-attribute-node.md) | Done |
| [021-sri-named-item.md](021-sri-named-item.md) | Done |
| [022-sri-document-write.md](022-sri-document-write.md) | Done |
| [023-sri-iframe-srcdoc.md](023-sri-iframe-srcdoc.md) | Done |
| [024-body-redirect-delivery.md](024-body-redirect-delivery.md) | Done |
| [025-api-client.md](025-api-client.md) | Done — Slices A–C (2026-10-09) |
| [026-db-client.md](026-db-client.md) | Done — A–D shipped; live docker e2e needs local Docker (Approved 2026-10-09) |
| [027-db-connection-options.md](027-db-connection-options.md) | Done — Connection options (Hamza Approved 2026-10-09); live TLS compose needs Docker |
| [028-os-packs.md](028-os-packs.md) | Done — Self-sufficient OS packs (Hamza Approved 2026-10-09); ADR-029 |
| [029-closed-rogers-native-helper.md](029-closed-rogers-native-helper.md) | Public hooks Done (2026-10-09); ADR-030; private Go helper / packs still out of tree |
| [030-ssl-tableplus-ux.md](030-ssl-tableplus-ux.md) | Done — always-visible SSL paths + encrypted-key passphrase modal (Hamza “Go” 2026-10-09) |
| [031-faster-pickfile.md](031-faster-pickfile.md) | Done — native Win32 / compiled macOS pickFile (Hamza “Go” 2026-10-09) |
| [032-cassandra-jks-tls.md](032-cassandra-jks-tls.md) | Done — optional JKS/PKCS12 truststore+keystore (general; Cassandra-first) |

New plans only for **Approved** specs (`spec-workflow` gate).

Use project skill `plan-workflow` when creating or executing plans.
