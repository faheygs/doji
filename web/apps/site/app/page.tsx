import { Box, Button, Paper, Typography } from '@mui/material';
import { MarketingHero, PreviewNotice } from '@doji/ui';

export default function HomePage() {
  return (
    <>
      <PreviewNotice />
      <MarketingHero
        eyebrow="The daily social challenge"
        title={
          <>
            Ten minutes.
            <br />
            Show us what you’ve got.
          </>
        }
        description="One Doji goes live. You and your friends have ten minutes to jump in. Complete it to unlock the feed, keep your streak alive, and see how everyone answered."
        actions={
          <>
            <Button href="#how" size="large" variant="contained">
              See how it works
            </Button>
            <Button href="https://dojipro.com/support/" size="large" variant="outlined">
              Get support
            </Button>
          </>
        }
      />
      <Box component="section" id="how" sx={{ pb: 8 }}>
        <Typography variant="h2" component="h2" sx={{ mb: 4 }}>
          A small moment. Shared together.
        </Typography>
        <Box
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}
        >
          {[
            [
              'Get the alert',
              'The same daily Doji opens for eligible players at once. Everyone gets the same ten-minute window.',
            ],
            [
              'Make your move',
              'Vote, answer, take the photo, or complete the prompt. Submit and go straight to your unlocked feed.',
            ],
            [
              'See it happen live',
              'See what your friends shared. React, comment, and keep your streak going.',
            ],
          ].map(([title, body], index) => (
            <Paper component="article" key={title} variant="outlined" sx={{ p: 3 }}>
              <Typography color="primary" variant="h6" sx={{ mb: 2 }}>
                {index + 1}
              </Typography>
              <Typography component="h3" variant="h5">
                {title}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 2, lineHeight: 1.7 }}>
                {body}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Box>
      <Box component="section" sx={{ py: 6, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="h2" component="h2">
          Your people. Your boundaries.
        </Typography>
        <Typography sx={{ my: 3 }}>
          Report and block controls help keep your experience in your hands. Read our community
          guidelines and privacy policy to learn more.
        </Typography>
        <Button href="https://dojipro.com/community-guidelines/" variant="outlined">
          Community guidelines
        </Button>
      </Box>
      <Box
        component="section"
        sx={{ p: { xs: 3, sm: 6 }, my: 6, bgcolor: '#19191f', color: '#ffffff', borderRadius: 3 }}
      >
        <Typography variant="overline" sx={{ color: '#ff9878' }}>
          Doji for Business
        </Typography>
        <Typography variant="h2" component="h2">
          Be part of the moment.
        </Typography>
        <Typography sx={{ my: 3 }}>Explore Doji for Business and introduce your brand.</Typography>
        <Button href="https://business.dojipro.com/" variant="contained">
          Explore Doji for Business
        </Button>
      </Box>
    </>
  );
}
