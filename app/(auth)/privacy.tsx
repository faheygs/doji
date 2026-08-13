import React from 'react';
import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import { PRIVACY_SECTIONS } from '@/lib/legalDocuments';

export default function PrivacyScreen() {
  return <LegalDocumentScreen title="Privacy Policy" sections={PRIVACY_SECTIONS} />;
}
