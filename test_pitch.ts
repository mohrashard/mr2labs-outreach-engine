import fs from 'fs';
import path from 'path';

// Read env
const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = val;
  }
});

async function run() {
  const { generateAuditAndPitch, generateFollowUpPitch } = await import('./src/lib/ai/pitch');
  
  console.log('====== STEP 0: INITIAL OUTREACH ======');
  const step0 = await generateAuditAndPitch('Apex Capital', 'apexcapital.com', '', 'Financial Services', {
    founderName: 'Sarah',
    isTechnicalAudience: false,
    rawAuditData: {
      missing_scheduler: true,
    }
  });
  console.log(`Subject: ${step0.email_subject}`);
  console.log(`Body:\n${step0.generated_pitch}`);
  console.log('----------------------------------------\n');

  console.log('====== STEP 1: FOLLOW UP 1 ======');
  const step1 = await generateFollowUpPitch(
    step0.generated_pitch,
    1,
    'Apex Capital',
    'Financial Services',
    'Sarah',
    undefined,
    step0.audit_notes
  );
  console.log(`Subject: ${step1.email_subject}`);
  console.log(`Body:\n${step1.generated_pitch}`);
  console.log('----------------------------------------\n');

  console.log('====== STEP 2: FOLLOW UP 2 ======');
  const step2 = await generateFollowUpPitch(
    step1.generated_pitch,
    2,
    'Apex Capital',
    'Financial Services',
    'Sarah',
    undefined,
    step0.audit_notes
  );
  console.log(`Subject: ${step2.email_subject}`);
  console.log(`Body:\n${step2.generated_pitch}`);
  console.log('----------------------------------------\n');

  console.log('====== STEP 3: FOLLOW UP 3 (BREAKUP) ======');
  const step3 = await generateFollowUpPitch(
    step2.generated_pitch,
    3,
    'Apex Capital',
    'Financial Services',
    'Sarah',
    undefined,
    step0.audit_notes
  );
  console.log(`Subject: ${step3.email_subject}`);
  console.log(`Body:\n${step3.generated_pitch}`);
  console.log('----------------------------------------\n');
}

run();
