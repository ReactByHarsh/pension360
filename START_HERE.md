# Start here — original Pension360 UI with the Node backend

Use the complete **Pension360_Node_Express_PostgreSQL18_6_Original_UI.zip** release. Extract and retain its entire `pension360-node` folder. You do not need to combine earlier ZIPs or run the original Java project.

1. Read [README.md](README.md) for the Docker demonstration or local Node.js/PostgreSQL setup. Install dependencies from the supplied lockfile, configure your environment and apply the migrations.
2. For a fictional client demo, seed and prepare the baseline as documented. Use [the functional consultant guide](docs/FUNCTIONAL_CONSULTANT_DEMO.html) for role handovers, sample PDFs, synchronization and visual rules.
3. Read [UI restoration](docs/UI_RESTORATION.md) for original-interface provenance, navigation names and specific remaining Java feature differences. The original 80 route names and five added Node entries are retained; this does not assert 113-operation Java compatibility.
4. Read [Operations](docs/OPERATIONS.html), [Developer guide](docs/DEVELOPER_GUIDE.html), [FSD](docs/FSD.html) and [VALIDATION.md](docs/VALIDATION.md) before production acceptance.

The package includes source, tests, migrations, deployment configuration, six printable HTML guides and ten fictional PDF samples. Credentials, installed dependencies, generated build folders and local PostgreSQL binaries are deliberately excluded. Build/install during setup; preserve applicable [third-party notices](docs/third-party/README.md).

Live OpenAI, customer pension/ERP APIs, SSO, malware scanning and the target production deployment require their configured services and acceptance checks. Use the validation report for executed evidence; a working local demonstration does not certify those environments.

To regenerate this release from the project root, run `npm run package -- --original-ui`.
