/**
 * Public RPC commands accepted by the production command gateway.
 *
 * This is shared by the mobile type boundary and the Worker allowlist so a
 * client command cannot ship without the gateway knowing about it. Legacy
 * toggle commands remain temporarily available for installed older builds.
 */
export const AUTHENTICATED_COMMAND_NAMES = [
  'block_user',
  'buy_in_today',
  'clear_notification_history',
  'complete_doji_with_post',
  'create_own_profile',
  'delete_comment',
  'dismiss_notification',
  'edit_comment',
  'equip_shop_item',
  'mark_notification_center_opened',
  'moderate_report',
  'purchase_shop_item',
  'register_native_push_endpoint',
  'remove_friendship',
  'reserve_doji_media_upload',
  'request_friendship',
  'respond_to_friendship',
  'review_challenge_suggestion',
  'set_comment_like',
  'set_poll_vote_like',
  'set_post_comments_disabled',
  'set_post_reaction',
  'submit_challenge_suggestion',
  'submit_comment',
  'submit_content_report',
  'submit_poll_vote',
  'sync_notification_center_state',
  'toggle_comment_like',
  'toggle_poll_vote_like',
  'toggle_post_reaction',
  'unblock_user',
  'unregister_push_installation',
  'update_own_profile',
] as const;

export type AuthenticatedCommandName = (typeof AUTHENTICATED_COMMAND_NAMES)[number];
