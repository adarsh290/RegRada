const { chromium } = require('@playwright/test');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── Configuration ────────────────────────────────────────────
const BASE_URL = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
const WEAK_PROOF_PATH = path.resolve(__dirname, 'weak_proof.txt');
const STRONG_PROOF_PATH = path.resolve(__dirname, 'strong_proof_encryption.txt');

// ── Text Data for Circulars ─────────────────────────────────
const CIRCULAR_1_TEXT = `RESERVE BANK OF INDIA
DEPARTMENT OF REGULATION
CIRCULAR NO: RBI/2026-27/42 — DOR.FIN.REC.21/03.10.001/2026-27
Dated: May 15, 2026

Subject: Comprehensive Guidelines on Digital Lending — Regulatory Framework for Scheduled Commercial Banks

In exercise of the powers conferred by Sections 21 and 35A of the Banking Regulation Act, 1949, the Reserve Bank of India hereby issues the following directions to all Scheduled Commercial Banks:

1. MANDATORY TECHNOLOGY INFRASTRUCTURE UPGRADE
All banks shall implement end-to-end encryption (AES-256) for all digital lending transaction data flows between the bank's core systems, Lending Service Providers (LSPs), and Digital Lending Apps (DLAs). The IT Department shall complete implementation of the encryption upgrade across all production systems by August 15, 2026. Non-compliance shall attract supervisory action under Section 46 of the BR Act.

2. CUSTOMER GRIEVANCE REDRESSAL MECHANISM
Banks shall establish a dedicated Digital Lending Complaints Cell under the Retail Banking Division. This cell shall be operational with a dedicated toll-free number, email channel, and web portal by July 31, 2026. All complaints must be acknowledged within 24 hours and resolved within 30 days. The Retail Banking department is responsible for staffing, training, and SLA monitoring.

3. THIRD-PARTY LSP AUDIT REQUIREMENTS
The Legal Department shall conduct a comprehensive compliance audit of all existing Lending Service Provider (LSP) agreements. This audit must verify adherence to Fair Practices Code, data localization requirements under the RBI Data Localization Circular of 2018, and KYC/AML compliance. The audit report shall be submitted to the Board Audit Committee by September 30, 2026.

4. ENHANCED DISCLOSURE NORMS — KEY FACT STATEMENT (KFS)
All digital lending products must display a standardized Key Fact Statement (KFS) before loan disbursement, containing: APR, total cost of borrowing, cooling-off period details, and penal charges. The IT Department shall integrate KFS generation into all digital lending platforms by July 15, 2026. Additionally, the Legal Department must review and approve the KFS template for regulatory accuracy by June 30, 2026.

5. DATA PRIVACY AND CUSTOMER CONSENT FRAMEWORK
Banks shall implement a comprehensive consent architecture compliant with the Digital Personal Data Protection Act, 2023. Granular consent must be obtained for each data category (financial, biometric, behavioral). The Operations Department shall deploy the consent management platform by October 31, 2026. The IT Department shall ensure API-level integration of the consent layer with all LSP/DLA interfaces by November 15, 2026.

6. AUTOMATED BORROWER RISK SCORING VALIDATION
All AI/ML-based credit scoring models used in digital lending must undergo independent model validation. The Risk Department shall engage an RBI-approved external auditor to validate model fairness, explainability, and bias. The validation report, including Adverse Action Notice templates, shall be filed with DOR by December 31, 2026. NOTE: This obligation CANNOT begin until obligation #5 (consent framework) is completed because model validation requires consent-governed training data.

7. PENAL CHARGES ON LOAN ACCOUNTS
With reference to RBI Circular on Penal Charges dated August 18, 2023 (Ref: RBI/2023-24/53), banks are reminded that NO penal interest shall be levied on borrowers. Only reasonable penal charges, not linked to the interest rate, may be applied. The Retail Banking department must update all loan agreement templates and system configurations by June 15, 2026. This is a reiteration of the 2023 directive — any existing non-compliance must be rectified immediately.

These directions shall come into force with immediate effect.

(Rajiv Kumar)
Chief General Manager`;

const CIRCULAR_2_TEXT = `RESERVE BANK OF INDIA
DEPARTMENT OF REGULATION
CIRCULAR NO: RBI/2026-27/67 — DOR.FIN.REC.45/03.10.001/2026-27
Dated: May 22, 2026

Subject: Amendments to Guidelines on Digital Lending — Revised Timelines and Modified Requirements

With reference to RBI/2026-27/42 dated May 15, 2026 ("the Original Circular"), the following modifications are hereby notified:

1. REVISED ENCRYPTION STANDARD
Para 1 of the Original Circular is hereby amended. Banks may implement EITHER AES-256 OR ChaCha20-Poly1305 encryption for digital lending data flows. The revised deadline for encryption implementation is extended to November 30, 2026 (previously August 15, 2026).

2. GRIEVANCE CELL — SCOPE EXPANSION
Para 2 is modified: The Digital Lending Complaints Cell shall now fall under the Operations Department (not Retail Banking as previously specified). The deadline remains July 31, 2026. Additionally, the cell must now also handle complaints related to Buy Now Pay Later (BNPL) products.

3. KFS DISCLOSURE — DEADLINE ADVANCEMENT
Para 4 is amended: The KFS integration deadline is ADVANCED from July 15, 2026 to June 20, 2026. Banks must prioritize this implementation immediately.

4. PENAL CHARGES — CONTRADICTORY DIRECTIVE
Notwithstanding Para 7 of the Original Circular and RBI/2023-24/53, banks SHALL levy a flat processing fee of Rs. 500 on all delinquent digital lending accounts exceeding 90 DPD. This fee is in addition to any penal charges applied under the revised framework. This supersedes the previous "no penal interest" directive for digital lending accounts only.

5. NEW REQUIREMENT — DIGITAL LENDING REGISTRY
All Scheduled Commercial Banks shall register with the proposed Digital Lending Registry (DLR) maintained by RBI. The IT Department shall complete API integration with the DLR portal by January 31, 2027. This is a new obligation not present in the Original Circular.

These amendments shall come into force with immediate effect.

(Priya Sharma)
Executive Director`;

// Helper: Ensure directories and temp files exist
function prepareEnvironment() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  // Create weak proof file
  fs.writeFileSync(WEAK_PROOF_PATH, `INTERNAL MEMO — IT Department
Subject: SSL Certificate Renewal
Date: May 20, 2026

We have renewed our SSL certificates for the main banking portal.
All web traffic is now secured with TLS 1.3.
Renewal is valid until May 2028.

Signed,
IT Security Team`);

  // Create strong proof file
  fs.writeFileSync(STRONG_PROOF_PATH, `COMPLIANCE IMPLEMENTATION REPORT
IT Department — Canara Bank
Date: May 22, 2026
Ref: RBI/2026-27/42, Clause 1

Subject: End-to-End AES-256 Encryption Implementation for Digital Lending Data Flows

1. SCOPE
This report confirms the implementation of AES-256 encryption across all digital lending data flows as mandated by RBI Circular RBI/2026-27/42.

2. IMPLEMENTATION DETAILS
- AES-256-GCM encryption deployed on all API channels between:
  a) Core Banking System (CBS) ↔ Lending Service Providers (LSPs): Encrypted via mutual TLS + AES-256 payload encryption
  b) CBS ↔ Digital Lending Apps (DLAs): All REST API payloads encrypted with AES-256-GCM
  c) Internal microservice communication: Encrypted using envelope encryption (KMS-backed AES-256 keys)

3. PRODUCTION DEPLOYMENT
- Deployment completed: May 18, 2026 (3 months ahead of Aug 15, 2026 deadline)
- All 14 production servers migrated
- Key rotation policy: Every 90 days via AWS KMS
- Zero-downtime migration confirmed

4. TESTING & VALIDATION
- Penetration test conducted by CyberSafe Auditors (CERT-IN empaneled)
- All 47 API endpoints tested for encryption compliance
- No unencrypted data flows detected

5. EVIDENCE ARTIFACTS
- Deployment logs attached (ref: deploy-enc-2026-05-18.log)
- Pen-test certificate: CS/2026/PT-4421
- KMS configuration audit trail attached

Approved by: CTO, Canara Bank`);

  console.log('📁 Environment prepared. Created weak and strong text proof files.');
}

// Helper: Run DB Reset
function resetDB() {
  console.log('🔄 Resetting MongoDB database...');
  try {
    execSync('npx ts-node-dev --transpile-only src/scripts/resetDemo.ts', {
      cwd: path.resolve(__dirname, '../backend'),
      stdio: 'inherit'
    });
    console.log('✅ Database reset successfully.');
  } catch (err) {
    console.error('⚠️ DB reset command failed, but proceeding anyway:', err.message);
  }

  // Clear ChromaDB vector store to avoid stale embeddings
  const chromaDbPath = path.resolve(__dirname, '../ai_service/chroma_db');
  if (fs.existsSync(chromaDbPath)) {
    console.log('🗑️ Clearing ChromaDB vector store...');
    fs.rmSync(chromaDbPath, { recursive: true, force: true });
    console.log('✅ ChromaDB cleared.');
  }
}

// Main execution function
async function run() {
  prepareEnvironment();
  resetDB();

  console.log('🚀 Starting Playwright Browser Automation for RegRada Demo Scenario...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 850 });

  // Share encryption MAP ID across contexts
  let encryptionMapId = '';
  let lspMapId = '';

  try {
    // ── Helper: Login function ─────────────────────────────────
    async function login(username, password) {
      console.log(`🔑 Logging in as ${username}...`);
      await page.goto(`${BASE_URL}/`);
      await page.waitForSelector('id=login-username');
      await page.fill('id=login-username', username);
      await page.fill('id=login-password', password);
      await page.click('id=login-submit');
      // Wait for layout to load
      await page.waitForSelector('text=RegRadar');
    }

    // ── Helper: Logout function ────────────────────────────────
    async function logout() {
      console.log('🔓 Logging out...');
      await page.click('button:has-text("Sign Out")');
      await page.waitForSelector('id=login-username');
    }

    // ── PHASE 1: Ingest First Circular (CO) ──────────────────────
    console.log('\n--- 📋 Phase 1: Ingest First Circular (CO) ---');
    await login('compliance.officer', 'Admin@123');
    
    // Navigate to submit page
    await page.goto(`${BASE_URL}/submit`);
    await page.waitForSelector('id=circular-title');

    // Click Paste Text Tab
    await page.click('button:has-text("Paste Text")');

    // Fill metadata & raw text
    await page.fill('id=circular-title', 'Guidelines on Digital Lending – Regulatory Framework');
    await page.fill('id=circular-source', 'RBI/2026-27/42');
    await page.fill('textarea[placeholder="Paste the full text of the circular here..."]', CIRCULAR_1_TEXT);
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_phase1_ingest_filled.png') });
    console.log('👉 Form filled. Clicking Run AI Pipeline...');
    
    await page.click('button:has-text("Run AI Pipeline")');

    // Wait for the AI Pipeline completion (large timeout since local LLM)
    console.log('⏳ Waiting for AI extraction to complete (this could take up to 2-3 mins)...');
    await page.waitForSelector('text=Extraction Complete!', { timeout: 300000 });
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_phase1_ingest_complete.png') });
    console.log('✅ Extraction complete screenshot captured.');

    // Go to Compliance Inbox
    await page.goto(`${BASE_URL}/inbox`);
    await page.waitForSelector('text=Guidelines on Digital Lending – Regulatory Framework');
    
    // Expand the circular
    await page.click('text=Guidelines on Digital Lending – Regulatory Framework');
    await page.waitForSelector('text=Measurable Action Points');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_phase1_inbox_expanded.png') });

    // Verify extracted MAPs and grab IDs dynamically
    console.log('🔍 Inspecting inbox action points...');
    
    // Find encryption MAP
    const encryptRow = page.locator('tr', { hasText: 'encryption' });
    const encryptIdText = await encryptRow.locator('td.font-mono').innerText();
    encryptionMapId = encryptIdText.trim();
    console.log(`🎯 Found Encryption MAP ID: ${encryptionMapId}`);

    // Find LSP Audit MAP
    const lspRow = page.locator('tr', { hasText: 'LSP agreements' }).first();
    const lspIdText = await lspRow.locator('td.font-mono').innerText();
    lspMapId = lspIdText.trim();
    console.log(`🎯 Found LSP Audit MAP ID: ${lspMapId}`);

    await logout();


    // ── PHASE 2: Department Proof Upload — Weak Evidence (IT Dept) ─────
    console.log('\n--- 📋 Phase 2: Department Proof Upload - Weak Evidence (IT) ---');
    await login('it.dept', 'Dept@123');

    // Wait for portal to load
    await page.waitForSelector('text=IT Dept Portal');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_phase2_it_portal.png') });

    // Find encryption upgrade card (using dynamic ID)
    const encryptCard = page.locator('div.bg-gray-900', { hasText: encryptionMapId });
    await encryptCard.scrollIntoViewIfNeeded();

    // Click upload proof
    await encryptCard.locator('button:has-text("Upload Proof of Compliance")').click();
    await page.waitForSelector('text=Upload Proof of Compliance');

    // Upload weak proof
    console.log('Uploading weak proof document...');
    await page.setInputFiles('input[type="file"]', WEAK_PROOF_PATH);
    await page.fill('textarea[id="proof-notes"]', 'Attached SSL certificate renewal logs.');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_phase2_upload_weak_filled.png') });

    await page.click('button:has-text("Submit Proof")');

    // Wait for modal to close (it refreshes data)
    await page.waitForTimeout(3000); 

    // Find encryption upgrade card again and check status
    console.log('Checking AI verdict for weak proof...');
    await page.waitForSelector(`div.bg-gray-900:has-text("${encryptionMapId}"):has-text("Rejected")`, { timeout: 90000 });
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_phase2_weak_proof_rejected.png') });
    console.log('❌ Proof successfully rejected by AI Auditor (as expected).');


    // ── PHASE 3: Department Re-Upload — Strong Evidence (IT Dept) ────
    console.log('\n--- 📋 Phase 3: Department Re-Upload - Strong Evidence (IT) ---');
    
    // Click Re-upload button
    const rejectedCard = page.locator('div.bg-gray-900', { hasText: encryptionMapId });
    await rejectedCard.locator('button:has-text("Re-upload")').click();
    await page.waitForSelector('text=Upload Proof of Compliance');

    // Upload strong proof
    console.log('Uploading strong proof document...');
    await page.setInputFiles('input[type="file"]', STRONG_PROOF_PATH);
    await page.fill('textarea[id="proof-notes"]', 'Attached formal cryptographic implementation report detailing AES-256-GCM configurations.');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_phase3_upload_strong_filled.png') });

    await page.click('button:has-text("Submit Proof")');

    // Wait for modal to close & refresh data
    await page.waitForTimeout(3000);

    // Verify status changes to awaiting review / submitted
    console.log('Checking AI verdict for strong proof...');
    await page.waitForSelector(`div.bg-gray-900:has-text("${encryptionMapId}"):has-text("Awaiting Review")`, { timeout: 90000 });
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_phase3_strong_proof_submitted.png') });
    console.log('✅ Proof successfully verified/submitted by AI Auditor.');

    await logout();


    // ── PHASE 4: Ingest a CONTRADICTORY Circular (CO) ──────────────────
    console.log('\n--- 📋 Phase 4: Ingest a Contradictory Circular (CO) ---');
    await login('compliance.officer', 'Admin@123');

    // Navigate to submit page
    await page.goto(`${BASE_URL}/submit`);
    await page.waitForSelector('id=circular-title');

    // Click Paste Text Tab
    await page.click('button:has-text("Paste Text")');

    // Fill metadata & raw text
    await page.fill('id=circular-title', 'Revised Guidelines on Digital Lending — Amendment');
    await page.fill('id=circular-source', 'RBI/2026-27/67');
    await page.fill('textarea[placeholder="Paste the full text of the circular here..."]', CIRCULAR_2_TEXT);
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_phase4_amendment_filled.png') });
    console.log('👉 Form filled. Clicking Run AI Pipeline...');
    
    await page.click('button:has-text("Run AI Pipeline")');

    // Wait for completion
    console.log('⏳ Waiting for AI extraction & contradiction analysis (could take 2-3 mins)...');
    await page.waitForSelector('text=Extraction Complete!', { timeout: 300000 });
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_phase4_amendment_complete.png') });
    console.log('✅ Amendment ingestion complete.');

    // Go to Compliance Inbox
    await page.goto(`${BASE_URL}/inbox`);
    await page.waitForSelector('text=Revised Guidelines on Digital Lending — Amendment');
    
    // Expand the card
    await page.click('text=Revised Guidelines on Digital Lending — Amendment');
    await page.waitForSelector('text=Amends:');
    
    // Take screenshot of delta & conflict tags
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_phase4_inbox_with_conflict.png') });
    console.log('🔥 Contradictions and Amendment badges verified in Inbox.');

    // Click Delta Report button
    await page.click('button:has-text("Amends:")');
    await page.waitForSelector('text=Delta Timeline Analysis');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_phase4_delta_report_modal.png') });
    
    // Close modal
    await page.click('button[aria-label="Close modal"]');
    
    await logout();


    // ── PHASE 5: Department Task Rejection (Legal Dept) ───────────────
    console.log('\n--- 📋 Phase 5: Department Task Rejection (Legal) ---');
    await login('legal.dept', 'Dept@123');

    await page.waitForSelector('text=Legal Dept Portal');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_phase5_legal_portal.png') });

    // Locate lsp card
    const lspCard = page.locator('div.bg-gray-900', { hasText: lspMapId });
    await lspCard.scrollIntoViewIfNeeded();

    // Click Reject Task
    await lspCard.locator('button:has-text("Reject Task")').click();
    await page.waitForSelector('text=Reason for Rejection');

    // Fill reason
    await page.fill('textarea[id="reject-reason"]', 'This task should be handled by the Risk/Audit Department, not Legal. We do not have the KYC/AML expertise required for Lending Service Provider compliance audits.');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_phase5_reject_modal_filled.png') });

    await page.click('button:has-text("Submit Rejection")');

    // Wait for refresh
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_phase5_rejected_state.png') });
    console.log('❌ Task rejected by Legal Department and re-routing triggered.');

    await logout();


    // ── PHASE 6: CO Manual Override & Conflict Resolution (CO) ──────────
    console.log('\n--- 📋 Phase 6: CO Manual Override & Conflict Resolution (CO) ---');
    await login('compliance.officer', 'Admin@123');

    // Navigate to Inbox
    await page.goto(`${BASE_URL}/inbox`);
    await page.waitForSelector('text=Guidelines on Digital Lending – Regulatory Framework');

    // Expand original circular
    await page.click('text=Guidelines on Digital Lending – Regulatory Framework');
    await page.waitForSelector('text=Measurable Action Points');

    // Locate encryption row (has dynamic ID)
    const encryptInboxRow = page.locator('tr', { hasText: encryptionMapId });
    
    // Force Approve the IT encryption MAP
    console.log('Clicking CO manual Approve on encryption MAP...');
    await encryptInboxRow.locator('button:has-text("Approve")').click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16_phase6_map_approved.png') });

    // Go to Audit Dashboard
    await page.goto(`${BASE_URL}/audit`);
    await page.waitForSelector('text=Automated Audit Reporting');

    // Resolve Conflict
    console.log('Resolving Contradictory penal charges conflict...');
    const conflictCard = page.locator('div.bg-gray-900', { hasText: 'penal charges' }).first();
    await conflictCard.locator('button:has-text("Resolve Conflict")').click();
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '17_phase6_conflict_resolved.png') });
    console.log('✅ Conflict resolved manually by Compliance Officer.');


    // ── PHASE 7: Natural Language Query (CO) ──────────────────────────
    console.log('\n--- 📋 Phase 7: Natural Language Query (CO) ---');
    
    // Select NL Search input
    const queryInput = page.locator('input[aria-label="Search compliance data"]');

    // Query 1: Which departments have encryption-related tasks?
    console.log('Querying: "Which departments have encryption-related tasks?"...');
    await queryInput.fill('Which departments have encryption-related tasks?');
    await queryInput.press('Enter');
    await page.waitForSelector('text=Search Results');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '18_phase7_query_encryption.png') });

    // Reset results
    await page.click('button:has(svg.lucide-x-circle)');

    // Query 2: What tasks involve data privacy and consent?
    console.log('Querying: "What tasks involve data privacy and consent?"...');
    await queryInput.fill('What tasks involve data privacy and consent?');
    await queryInput.press('Enter');
    await page.waitForSelector('text=Search Results');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '19_phase7_query_privacy.png') });

    // Reset results
    await page.click('button:has(svg.lucide-x-circle)');

    // Query 3: Find conflicts between penal charges directives
    console.log('Querying: "Find conflicts between penal charges directives"...');
    await queryInput.fill('Find conflicts between penal charges directives');
    await queryInput.press('Enter');
    await page.waitForSelector('text=Search Results');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '20_phase7_query_penal_conflict.png') });

    // Reset
    await page.click('button:has(svg.lucide-x-circle)');
    console.log('✅ Semantic searches completed and captured.');


    // ── PHASE 8: Obligation Graph (CO) ───────────────────────────────
    console.log('\n--- 📋 Phase 8: Obligation Graph (CO) ---');
    await page.goto(`${BASE_URL}/obligation-graph`);
    await page.waitForSelector('text=Circular Dependency Graph');

    // Select the first circular from dropdown (if any dropdown exists, else default is loaded)
    // Wait for the graph nodes to render
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '21_phase8_obligation_graph.png') });
    console.log('✅ Obligation Graph loaded and verified.');


    // ── PHASE 9: Final Audit Dashboard Review ────────────────────────
    console.log('\n--- 📋 Phase 9: Final Audit Dashboard Review ---');
    await page.goto(`${BASE_URL}/audit`);
    await page.waitForSelector('text=Automated Audit Reporting');

    // Wait for data load
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '22_phase9_final_dashboard.png') });
    console.log('✅ Final Audit Dashboard verified.');

    console.log('\n🎉 ALL 9 PHASES OF THE DEMO SCENARIO EXECUTED SUCCESSFULLY!');

  } catch (error) {
    console.error('\n❌ Test automation encountered an error:', error);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error_failure.png') });
    process.exitCode = 1;
  } finally {
    await browser.close();
    
    // Clean up temporary files
    try {
      if (fs.existsSync(WEAK_PROOF_PATH)) fs.unlinkSync(WEAK_PROOF_PATH);
      if (fs.existsSync(STRONG_PROOF_PATH)) fs.unlinkSync(STRONG_PROOF_PATH);
    } catch (_) {}

    console.log('\n👋 Browser closed. Test script finished execution.');
  }
}

run();
