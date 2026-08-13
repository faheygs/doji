import React from 'react';
import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import { TERMS_SECTIONS } from '@/lib/legalDocuments';

export default function AppTermsScreen() {
  return <LegalDocumentScreen title="Terms of Use" sections={TERMS_SECTIONS} />;
}
