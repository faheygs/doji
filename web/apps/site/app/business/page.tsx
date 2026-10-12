import type { Metadata } from 'next';
import { Button, Stack, Typography } from '@mui/material';
import { MarketingHero } from '@doji/ui';
export const metadata: Metadata = {
  title: 'Doji for Business',
  description: 'Introduce your business and explore Doji for Business.',
  alternates: { canonical: '/business/' },
};
export default function BusinessPage() {
  return (
    <>
      <MarketingHero
        business
        eyebrow="Doji for Business"
        title="Be part of the moment."
        description="Introduce your brand and explore a more participatory way to connect with people through Doji."
        actions={
          <>
            <Button variant="contained" href="https://business.dojipro.com/">
              Explore Doji for Business
            </Button>
            <Button
              variant="outlined"
              href="https://business.dojipro.com/business-portal/access/?mode=signin"
            >
              Business sign in
            </Button>
          </>
        }
      />
      <Stack spacing={2} sx={{ py: 5 }}>
        <Typography variant="h4" component="h2">
          A simple start. A thoughtful review.
        </Typography>
        <Typography>
          Create your business account, tell us about your business, and follow your application’s
          progress. Registration does not enable campaign publishing or billing.
        </Typography>
      </Stack>
    </>
  );
}
