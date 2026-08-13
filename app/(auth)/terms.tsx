import React from 'react';
import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import { TERMS_SECTIONS } from '@/lib/legalDocuments';

export default function TermsScreen() {
  return <LegalDocumentScreen title="Terms of Use" sections={TERMS_SECTIONS} />;
}
