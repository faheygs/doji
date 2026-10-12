import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Box, Button, Stack } from '@mui/material';
import { policyRoutes, publicContent } from '../../lib/content';

export const dynamicParams = false;
export function generateStaticParams() {
  return policyRoutes.map((slug) => ({ slug }));
}
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!policyRoutes.some((route) => route === slug)) notFound();
  const content = await publicContent(slug);
  return {
    title: { absolute: content.title },
    description: content.description,
    alternates: { canonical: `/${slug}/` },
  };
}
export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  if (!policyRoutes.some((route) => route === slug)) notFound();
  const content = await publicContent(slug);
  return (
    <>
      <Box
        sx={{
          py: 4,
          lineHeight: 1.8,
          '& h1': { typography: 'h2', maxWidth: 900, my: 2 },
          '& h2': { typography: 'h5', mt: 4, mb: 1 },
          '& p': { my: 2 },
          '& a': { color: 'primary.main', textUnderlineOffset: '3px' },
          '& .eyebrow': { typography: 'overline', color: 'primary.main' },
          '& .intro': { typography: 'h6', fontWeight: 400, color: 'text.secondary', maxWidth: 900 },
          '& .effective': { typography: 'body2', color: 'text.secondary' },
          '& .legalContent': {
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 240px' },
            gap: 5,
            mt: 4,
          },
          '& .legalArticle': { minWidth: 0, overflowWrap: 'anywhere' },
          '& .sideNav': {
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            borderLeft: 1,
            borderColor: 'divider',
            pl: 3,
            alignSelf: 'start',
          },
        }}
        dangerouslySetInnerHTML={{ __html: content.body }}
      />
      <Stack direction="row" spacing={2} sx={{ py: 3, flexWrap: 'wrap' }}>
        <Button href="/safety-removal/" variant="outlined">
          Report content or request removal
        </Button>
        <Button href="/child-safety/">Child safety</Button>
        <Button href="mailto:support@dojipro.com?subject=Doji%20Moderation%20Appeal">
          Appeal support
        </Button>
      </Stack>
    </>
  );
}
