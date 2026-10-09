import { Controller, type UseFormReturn } from 'react-hook-form';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { announcementDestinations, type AnnouncementInput } from './announcement';

export function AnnouncementOptions({ form }: { form: UseFormReturn<AnnouncementInput> }) {
  const {
    control,
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const reward = watch('reward');
  return (
    <Accordion variant="outlined" defaultExpanded={Boolean(watch('ctaUrl')) || reward !== 'none'}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography component="h2">Button, reward and display settings</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={3}>
          <TextField
            label="Button label"
            {...register('ctaLabel')}
            error={!!errors.ctaLabel}
            helperText={errors.ctaLabel?.message ?? 'Optional · up to 40 characters'}
            slotProps={{ htmlInput: { maxLength: 40 } }}
          />
          <Controller
            name="ctaUrl"
            control={control}
            render={({ field }) => (
              <TextField {...field} select label="Button destination">
                {Object.entries(announcementDestinations).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            name="reward"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="Completion reward"
                onChange={(event) => {
                  field.onChange(event);
                  if (event.target.value === 'none') setValue('sparks', 0, { shouldDirty: true });
                }}
              >
                <MenuItem value="none">No reward</MenuItem>
                <MenuItem value="submit_idea">Sparks for submitting a Doji idea</MenuItem>
              </TextField>
            )}
          />
          {reward === 'submit_idea' && (
            <>
              <TextField
                label="Sparks per completion"
                type="number"
                {...register('sparks', { valueAsNumber: true })}
                error={!!errors.sparks}
                helperText={errors.sparks?.message ?? '1–10,000 Sparks'}
                slotProps={{ htmlInput: { min: 1, max: 10000, step: 1 } }}
              />
              <Alert severity="info">
                Once per member for a valid new idea submitted during the published window. Viewing,
                tapping or dismissing does not earn this reward.
              </Alert>
            </>
          )}
          <TextField
            label="Maximum displays per account"
            type="number"
            {...register('impressions', { valueAsNumber: true })}
            error={!!errors.impressions}
            helperText={errors.impressions?.message ?? '1–10 · dismissal stops future displays'}
            slotProps={{ htmlInput: { min: 1, max: 10, step: 1 } }}
          />
          <TextField
            label="Hours between displays"
            type="number"
            {...register('spacing', { valueAsNumber: true })}
            error={!!errors.spacing}
            helperText={errors.spacing?.message ?? '1–720 hours'}
            slotProps={{ htmlInput: { min: 1, max: 720, step: 1 } }}
          />
          <Controller
            name="priority"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="Display priority"
                onChange={(event) => field.onChange(Number(event.target.value))}
              >
                <MenuItem value={0}>Normal</MenuItem>
                <MenuItem value={10}>Elevated</MenuItem>
                <MenuItem value={20}>High</MenuItem>
              </TextField>
            )}
          />
          <Typography variant="body2" color="text.secondary">
            Publishing is subject to the existing server overlap and member-eligibility checks.
          </Typography>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
