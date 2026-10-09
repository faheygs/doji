'use client';

import { Box, Card, CardContent, Chip, Divider, Stack, Typography } from '@mui/material';

/** A static marketing illustration, never a live timer, poll or member record. */
export function MomentPreview({ business }: { business: boolean }) {
  return (
    <Box
      sx={{
        p: { xs: 3, sm: 5 },
        borderRadius: 4,
        background: 'linear-gradient(145deg, #fff0e8 0%, #eee7ff 100%)',
      }}
    >
      <Card elevation={4} sx={{ bgcolor: '#19191f', color: '#ffffff', borderRadius: 3 }}>
        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
          <Stack
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
          >
            <Typography variant="overline" sx={{ color: '#ff9878' }}>
              One shared moment
            </Typography>
            <Typography variant="caption" sx={{ color: '#c7c2d1' }}>
              Illustration
            </Typography>
          </Stack>
          <Typography
            sx={{ fontSize: { xs: 52, sm: 64 }, fontWeight: 800, letterSpacing: '-0.05em', my: 3 }}
          >
            {business ? 'Join in.' : '10:00'}
          </Typography>
          <Chip
            label={business ? 'Doji for Business' : 'The daily Doji'}
            size="small"
            sx={{ bgcolor: '#3b2c26', color: '#ffb49b' }}
          />
          <Typography variant="h5" component="p" sx={{ mt: 2, mb: 3 }}>
            {business
              ? 'People. Not impressions.'
              : 'A little less scrolling. A little more doing.'}
          </Typography>
          <Divider sx={{ borderColor: '#494450', mb: 3 }} />
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {['Show up', 'Make your move', 'Connect'].map((label) => (
              <Chip
                key={label}
                label={label}
                variant="outlined"
                size="small"
                sx={{ color: '#e6dbff', borderColor: '#665584' }}
              />
            ))}
          </Stack>
        </CardContent>
      </Card>
      <Typography align="center" variant="body2" sx={{ mt: 3, color: '#554468', fontWeight: 600 }}>
        {business ? 'Be part of the experience.' : 'Ten minutes. Everyone in.'}
      </Typography>
    </Box>
  );
}
