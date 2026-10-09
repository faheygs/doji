// Employee-only same-origin routing. No new shared Worker/member endpoints.
export interface EmployeeFeatureGates {
  announcementComposeEnabled?: boolean;
  businessApplicationsEnabled?: boolean;
  businessPrivacyEnabled?: boolean;
  staffWorkflowEnabled?: boolean;
}
const direct: Readonly<Record<string, string>> = Object.freeze({
  '/announcements/compose': 'admin_announcement_compose_v1',
  '/safety/page': 'get_admin_safety_removals_v1',
  '/safety/case': 'get_admin_safety_removal_v1',
  '/safety/target': 'get_admin_safety_target_v1',
  '/safety/create-report': 'admin_create_safety_report_v1',
  '/safety/command': 'admin_safety_removal_command_v1',
  '/business/page': 'get_admin_business_applications_page_v1',
  '/business/item': 'get_admin_business_application_v1',
  '/business/command': 'admin_business_application_command_v1',
  '/business-privacy/page': 'get_admin_business_privacy_page_v1',
  '/business-privacy/case': 'get_admin_business_privacy_case_v1',
  '/business-privacy/access': 'get_admin_business_privacy_access_v1',
  '/business-privacy/correction': 'get_admin_business_privacy_correction_v1',
  '/business-privacy/open': 'admin_business_privacy_open_v1',
  '/business-privacy/command': 'admin_business_privacy_command_v1',
  '/staff-workflow/page': 'get_admin_owned_work_page_v1',
  '/staff-workflow/inbox': 'get_admin_staff_work_page_v1',
  '/staff-workflow/safety': 'get_admin_safety_work_page_v1',
  '/staff-workflow/channels': 'get_admin_staff_event_channels_v1',
  '/staff-workflow/ownership': 'get_admin_case_ownership_v1',
  '/staff-workflow/command': 'admin_case_ownership_command_v1',
  '/staff-workflow/assignees': 'get_admin_case_assignees_v1',
});
export function employeeDirectRoute(path: string, method: string, config: EmployeeFeatureGates) {
  if (!Object.hasOwn(direct, path)) return null;
  const deny = (message: string, status: number): never => {
    throw Object.assign(Error(message), { status });
  };
  if (method !== 'POST') deny('Invalid portal request.', 400);
  if (path === '/announcements/compose' && config.announcementComposeEnabled !== true)
    deny('Announcement composition is not enabled.', 403);
  if (path.startsWith('/business/') && config.businessApplicationsEnabled !== true)
    deny('Business review is not enabled.', 403);
  if (path.startsWith('/business-privacy/') && config.businessPrivacyEnabled !== true)
    deny('Business privacy is not enabled.', 403);
  if (path.startsWith('/staff-workflow/') && config.staffWorkflowEnabled !== true)
    deny('Staff workflow is not enabled.', 403);
  return direct[path] ?? null;
}
