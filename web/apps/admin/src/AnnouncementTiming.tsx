import { Controller, type UseFormReturn } from 'react-hook-form';
import {
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { AnnouncementInput } from './announcement';
dayjs.extend(utc);

export function AnnouncementTiming({ form }: { form: UseFormReturn<AnnouncementInput> }) {
  const { control, watch } = form;
  return (
    <>
      <FormControl>
        <FormLabel id="timing-label">When should it appear?</FormLabel>
        <Controller
          name="timing"
          control={control}
          render={({ field }) => (
            <RadioGroup {...field} aria-labelledby="timing-label" row>
              <FormControlLabel value="now" control={<Radio />} label="Publish now" />
              <FormControlLabel value="scheduled" control={<Radio />} label="Schedule" />
            </RadioGroup>
          )}
        />
      </FormControl>
      {(['start', 'end'] as const).map((name) =>
        name === 'start' && watch('timing') !== 'scheduled' ? null : (
          <Controller
            key={name}
            name={name}
            control={control}
            render={({ field }) => (
              <DateTimePicker
                timezone="UTC"
                label={name === 'start' ? 'Start showing (UTC)' : 'Stop showing (UTC)'}
                value={field.value === null ? null : dayjs.utc(field.value)}
                onChange={(value, context) =>
                  field.onChange(
                    !context.validationError && value?.isValid() ? value.valueOf() : null,
                  )
                }
                slotProps={{ textField: { fullWidth: true } }}
              />
            )}
          />
        ),
      )}
      <Typography variant="body2" color="text.secondary">
        Time zone: UTC. Enter UTC dates to avoid daylight-saving ambiguity. Publish now uses server
        time. An in-app announcement does not send a push notification.
      </Typography>
    </>
  );
}
