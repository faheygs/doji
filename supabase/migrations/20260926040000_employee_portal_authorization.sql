-- Reviewed employee authorization and approved rate-limit dispatch. Promote only after release gates pass.
-- Portal-only authorization migration. Does not grant the employee DB role any
-- member RPC/table access, change member RLS, or alter the Auth signup hook.
begin;
set local lock_timeout = '3s';

set local statement_timeout='30s';
create temporary table employee_release_expected(signature text, fingerprint text) on commit drop;
insert into employee_release_expected values ('accepted_friend_ids(uuid)','055c2abb25cdd4accb42e9f602a5b414'),
('activate_daily_event(uuid)','d53835a47acdea37c588c58f05fa7ad9'),
('admin_current_operator_role()','3cfbaead0ca71d698ea171b4fe95d5c8'),
('admin_decide_report_v2_before_member_delivery_20260924(uuid,text,text,text,text,text,text)','db725d41a3c167cd9c46d64a98e119db'),
('admin_decide_report_v2_hierarchical_legacy_20260924(uuid,text,text,text,text,text,text)','8f277457ba9aa2d7d41a8c44b1e7108b'),
('admin_decide_report_v2_legacy_20260924(uuid,text,text,text,text,text,text)','b710174cd2bf3ef5be25332f60d38bdc'),
('admin_decide_report_v2(uuid,text,text,text,text,text,text)','d7a6d0e210f72e501b64d9a3b66f1c23'),
('admin_decide_report_v3(uuid,text,text,text,text,text,text,integer,text)','710a1c0f59a0d2b189d82199431918bf'),
('admin_decide_report(uuid,text,text,text)','5771819a7030a9a2d541e2a69ca1793f'),
('admin_review_moderation_appeal_before_account_restrictions_2026(uuid,text,text,text)','d2acf90f18da89bb1f60d22ecd6ac7df'),
('admin_review_moderation_appeal(uuid,text,text,text)','9c69f3f6b20979366b3cf964630f60ff'),
('admin_set_operator_role_v1(text,text,boolean,text,text)','9d8dbc1e802b1f2e1e87c05dfb8f716f'),
('admin_set_report_review_state_v1(uuid,text,text,text)','f5ad019dfe5c5562a5b20e60e0d91bec'),
('admin_triage_report_before_restricted_guard_20260924(uuid,text,text,text,text)','295fba918c41aeccdf27e303a4b9d130'),
('admin_triage_report(uuid,text,text,text,text)','e20a860d0932c0e4a9a918849b5b3769'),
('admin_user_has_permission(text)','186bd7601a923e06ab84299d914cccbc'),
('advance_doji_push_fanout_shard(uuid,smallint,uuid,uuid,boolean,integer,integer)','ea254a707508b3ee8236177395bdeab7'),
('are_friends(uuid,uuid)','c9f4d22caf5a036837d979adba064905'),
('assert_acceptable_content(text)','d7ae09e78e661ebe76cdc8fce7aa888b'),
('assert_friend_capacity(uuid,uuid)','ad1ec2f13155b37a1ad6bb8734d55584'),
('assign_report_target_kind()','2c92817da67fa8153eef2dc30821971c'),
('author_completed_today(uuid)','3f0e21cd33a4e9322307d636d87e901d'),
('award_sparks_once(uuid,integer,text,text)','b73f1749778672d720062026bc221b75'),
('award_sparks(uuid,integer,text,text)','b37a2d5370c9db779f3447c367b57757'),
('award_tiered_badges_for_user(uuid)','9d05517f5cc4d40539ff57aebcd4ade4'),
('badge_metric_value(uuid,text)','e874d6fb7ad017620f0a99ae658068e8'),
('begin_daily_event_prelive(uuid)','aaa35e840e92adf5ab91e1398265648b'),
('block_user(uuid,text)','34128f855fe1b600f1ff9426ac39448b'),
('blocked_user_count()','ac6e56679563fc4f7e3d8b982141cd7d'),
('bootstrap_employee_owner_v1(uuid,text)','b73947ae4e0a0200f1820ba5994890f0'),
('buy_in_today()','62463d92a77763b30bf2d5d2425536d0'),
('buy_in_today(text)','d5dcc9ae7f56ab4bd89dd1744df8e761'),
('can_access_daily_event(uuid,uuid)','62e201cdc2188e43c17c2ff146b624e7'),
('can_read_post_media(text,uuid)','c0c53a2d75dfc5cc9d5e2c270c9dfc17'),
('can_view_full_post(uuid,uuid,uuid,uuid,boolean)','7c0d2463bbbd80447a99b74c57b4f6df'),
('can_view_full_post(uuid,uuid)','638f6fdbcd82227904b7a9b1b2a52afa'),
('can_view_profile(uuid,uuid)','8792bec4736cb1b272268b6a03298f78'),
('claim_account_deletion_cleanup(integer)','9f31231e952d762bb5875e564f84170a'),
('claim_active_app_announcement()','c449fcd1dd32d4c55e5427db420dc95c'),
('claim_apns_provider_token(text,text)','a2a58ddb0976b51799a10d0d83c8dbed'),
('claim_doji_push_fanout_shard(uuid,smallint)','98141aca62b16e12cadf475eb6dcd2ff'),
('claim_domain_events_v2(integer)','143de8f41705fdc77041845afd96639b'),
('claim_domain_events(integer)','613c925f94dccadddb344da77a120ec0'),
('claim_employee_registration_v1()','b694a263afc5e2abdb89064265fb111f'),
('claim_employee_verification_v1(text)','42102b879c2c833ea1cd90c8681ba9c3'),
('claim_expired_media_upload_intents(integer)','b0d72e69b2c72f6efa88e7d54ce0d6c7'),
('claim_operational_alert_delivery(text,jsonb)','8ef34e979d63ead97b5ba845fee22b59'),
('claim_pending_media_deletions(integer)','3a20ea374cd844d0298a287e8f1c203f'),
('claim_push_deliveries_batch(uuid,jsonb,text,text)','ea8d63073b1fa651e2f41568d94d53c2'),
('claim_push_delivery_targets_batch_v2(uuid,jsonb,text,text,text,text,timestamp with time zone)','5f8ed9d8679af7965e9042aa911994c8'),
('claim_push_delivery_targets_batch(uuid,jsonb,text,text)','72e02bf27cb916d9e0e479c47043fe36'),
('claim_push_delivery(text,uuid,text,text)','ded6cab7538f2c4999722bbb6fdf997e'),
('clear_notification_history(timestamp with time zone)','623a560a3996106872bae47cea399d72'),
('clear_verified_signup_birth_date()','baef58cfdb1913701ed7f75e49a72f93'),
('close_daily_event(uuid)','1e9129f4c2e73544c83f9aac7a719ed6'),
('close_targeted_daily_event(uuid)','77ba2ccd7909ab98bac64a61ae55cb2e'),
('comments_enforce_parent()','318e24e61c087c0bf6629459e9195830'),
('complete_doji_with_post(uuid,text,text,text,text,text,text,text)','ff7001b683d2b50eb552b3980f934df9'),
('complete_domain_event(uuid,uuid)','ea39b7ea79d2e7ff6f4de84ba2e4fe24'),
('complete_domain_events_batch(jsonb)','2f4ea73928c4c0f2b3ada5703e3cb00d'),
('complete_push_deliveries_batch(uuid,jsonb)','a377af06c099430da01745a57b6bd80c'),
('continue_domain_event_broadcast(uuid,uuid,uuid)','0ffaeb144a553f6367b1b6dab33fec48'),
('create_own_profile(text,text,text[],text,text,date,text,text)','bbc059d59fdd2df1868d558ce1fdf02c'),
('delete_comment(uuid,text)','54f0d13f63a1cee698170290d1c0cced'),
('delete_expired_api_rate_limit_buckets(integer)','0af0d2149a8f1c891b1acd014f9bddd5'),
('delete_media_upload_intents(uuid[])','6cb3e1d798892fad608dd27cbc2f0aa6'),
('delete_pending_media_deletions(uuid[])','882511db3bb921fa7d699f87cd6956fc'),
('delete_stale_committed_media_upload_intents(integer)','50009da0df43e16058f6f22f67c29037'),
('delete_stale_push_endpoints(integer)','2f55b146fdb398be0a4fd7e4ae07581e'),
('dismiss_notification(text,timestamp with time zone)','e9ae92ffded4e31a339781236510ce68'),
('doji_notify_admin_email(jsonb)','9b390d26830aa5b580c5da1acbaa164e'),
('edit_comment(uuid,text,text)','e2132e16838d2171826add8e1746fc00'),
('employee_login_allowed_v1(text)','94870512048c12cb446e6d6ae1c00755'),
('enforce_api_rate_limit(text,integer,integer)','fe9b4596464aa8623acc96804341d398'),
('enforce_critical_report_quarantine()','8dd5db17de17cce6985babaac1995591'),
('enforce_os_push_policy()','0fd158b580bf6b45fac6c69b9b90b903'),
('enforce_owned_profile_avatar()','4e0c5eca8837f6d29bb7df9714c455a9'),
('enforce_reserved_post_media()','3550ac4e4bc32cd0aeb95ce2889c4c80'),
('enqueue_domain_event(text,text,uuid,jsonb,text)','0497fc470882c8d77d93f4d59ac96afe'),
('enqueue_friend_fanout(text,uuid,jsonb,text)','7df7a8085f15ac1f5b99a0705f69e479'),
('ensure_today_user_event()','35169ef087dea0f3c2349f08949c6d4c'),
('equip_shop_item(text,text)','c0fb44bade900721925c6ed5933b47b5'),
('evaluate_badges(uuid)','eb443d39fcd15d1895a3f4fd4fd05feb'),
('expire_doji_push_fanout(uuid,text)','15980006a5a2fde6bff320342db7aaf3'),
('finish_account_deletion_cleanup(uuid,uuid,text)','1f779c6698651f76a6dc94133b837cb3'),
('friend_count(uuid)','b0bc85ca8fcb09a9af9f0ee87076664d'),
('friend_request_count()','ebd17b8c40ff96b3958882e36aa2e19a'),
('get_admin_appeals_snapshot(integer)','b4a680f8961e3e275c8d16946ee89efb'),
('get_admin_audit_export_v1(text,text)','1d314059296f0cba934bbcd5de58fefe'),
('get_admin_audit_page_v1(integer,timestamp with time zone,uuid)','ca771c0b8f6ad9612a03111ae9366edb'),
('get_admin_audit_page_v2(integer,timestamp with time zone,uuid,text,text)','e133adfc3429350d7253bee4d81ec338'),
('get_admin_command_center_snapshot_v2_before_queue_indicators_20(integer)','c93b61911e375d18a6f5064ab62c32db'),
('get_admin_command_center_snapshot_v2_before_work_item_context_2(integer)','e035e933fa2bcdb29c18e1e89d3b79e5'),
('get_admin_command_center_snapshot_v2_legacy_20260924(integer)','9d64db41d9d1b1e4f6a2edd22e165e88'),
('get_admin_command_center_snapshot_v2(integer)','46111e99c3b3a3de999913f49c19e255'),
('get_admin_command_center_snapshot(integer)','3f6b51744f47ffa558f94c3338f3d4eb'),
('get_admin_event_health_history_v1(integer)','63e23827579846f092fcb34ee2f7ab4d'),
('get_admin_operational_health_read_v1()','3bc60575c29cfba5793ab0456865e029'),
('get_admin_operator_directory_v1()','5c26af590b2487fafd245d8ce777bd4c'),
('get_admin_portal_session_v2_before_access_controls_20260925()','3a85aeacc51bfbc8d5161b898991f420'),
('get_admin_portal_session_v2()','d390843110e65e60e1fd94d82f525fc9'),
('get_admin_portal_session_v3()','3a361cf2693ef0e18ee74ea7f3c17d50'),
('get_admin_portal_session()','c26cb4695bb66465217346b20bbda2c2'),
('get_admin_realtime_token_capabilities()','532070d10b3423005323c642a146f8b0'),
('get_admin_report_case_v2_before_context_20260924(uuid)','4e99081bd5c90314830f37c32a732820'),
('get_admin_report_case_v2_before_history_20260924(uuid)','73a9fb6415b60c3b36a091f035b79e1b'),
('get_admin_report_case_v2_before_member_deletion_20260926(uuid)','f9af9ba1a8ae29d855c201f291c261fa'),
('get_admin_report_case_v2_before_policy_mapping_20260925(uuid)','5caa6afc342178c7d8298e06ce73fe17'),
('get_admin_report_case_v2_before_resolved_archive_20260924(uuid)','c6367456b50edc005be983e1fe60ae6e'),
('get_admin_report_case_v2_legacy_20260924(uuid)','169c2b8ab04eb483b8fc5bfd2437369b'),
('get_admin_report_case_v2(uuid)','27995ee4e6a2612bf7f52b9e1aff3f19'),
('get_admin_report_case(uuid)','8015488bf1c07e5ccefd9bc68c74205f'),
('get_admin_resolved_reports_page_v1(integer,timestamp with time zone,uuid)','2dbc551e1e1e63fcc8e051c5b9133b84'),
('get_admin_work_queue_page_v1(integer,text,text,text,timestamp with time zone,text)','7457ae93346ab4ec64af222be12e95f4'),
('get_comment_like_voters_page(uuid,integer,timestamp with time zone,uuid)','1f89a48d768db7b2d27bcaf91385bd22'),
('get_comment_thread_snapshot(uuid,text,timestamp with time zone,uuid,integer)','132580a5d1c8ccf54ee0a750831e6f81'),
('get_current_doji_state()','1eb2c6c31f5064851dfa0ef4575ff644'),
('get_current_profile_post(uuid)','dc20393e011aabb9f862b29995cec81a'),
('get_doji_push_fanout_health(uuid)','ae1f14d883a72d9e4689e574d271c8e0'),
('get_doji_push_recipients_page(uuid,uuid,integer)','1da7ce16a35e2aa2a0a8d0f8d071ba8b'),
('get_doji_push_recipients_shard_page(uuid,smallint,uuid,integer)','f753fd2c1446326ae08becdb94bf042d'),
('get_employee_registration_status_v1()','3488e37457f8d51df9176a1a2b5e7b3e'),
('get_feed_page_snapshot_v2(uuid,text,integer,timestamp with time zone,uuid)','12c31243ffaf30d6f11835ac4a0eca28'),
('get_feed_page_snapshot(uuid,text,integer,integer)','eddad7f9d2a25c59a60b418fa27e681f'),
('get_friend_fanout_realtime_topics(uuid)','163583a638420230f66b0b9cd0107dbe'),
('get_friend_ids(uuid)','f837a51a56debcb5e72988a551a46216'),
('get_leaderboard_snapshot(text,text,integer)','2ccca2a5ada38041f013f8ef08ce9358'),
('get_locked_feed_previews(uuid[],text,integer,integer)','55ed317fa3732c9ef89e8a0d97f959b2'),
('get_mobile_release_observability()','6e83c86db2e523a4a1cc5980f348e66f'),
('get_mobile_release_policy(text)','58b02fa56aaac241fdcfdee612e13f10'),
('get_moderation_push_recipient(uuid)','23591e97006054c9e508ed274ee9583a'),
('get_my_moderation_status()','f091fe75f8890c94bce5ac4fc5df23a0'),
('get_notification_center_bootstrap(timestamp with time zone,timestamp with time zone,jsonb,integer)','1dfdf255a7b61f50abcb28c755483690'),
('get_notification_center_snapshot_base(timestamp with time zone,integer)','ab8a9c771ac77460e92d1391768e560e'),
('get_notification_center_snapshot_without_moderation(timestamp with time zone,integer)','0bff0141f84d7b42b9af8ba688a181af'),
('get_notification_center_snapshot_without_post_context(timestamp with time zone,integer)','056e238bcc2f1e3f8663bfca0c1de4ae'),
('get_notification_center_snapshot(timestamp with time zone,integer)','d8330471df30a8f11e1c34b21f39244c'),
('get_operational_health()','2f41dd049fcd9f57601aaa4377566397'),
('get_own_profile()','69ad3f641457a6b5d10d7d9b44d3e762'),
('get_pending_reports_snapshot(integer)','8fd9c615bdfecfb6279a457d99ad0697'),
('get_pending_suggestions_snapshot(integer)','4ce48e93173df419111b0063357c976d'),
('get_poll_option_voters_page(uuid,uuid,text,integer,timestamp with time zone,uuid)','b0e9b6f286e6f3d5e6fdda7e020ef05d'),
('get_poll_results_summary(uuid,text)','2332a13ebcfacb9b39563f7e31fb1b1a'),
('get_poll_snapshot_for_feed(uuid,text)','ffdb27c909516fc2e8d28e9f09ce1b13'),
('get_poll_votes_for_feed(uuid,text)','68c57b8fa5730c55d96d7c0504a140a7'),
('get_post_detail(uuid)','f0110251cbf4d4fd5606a8c5a5835dfa'),
('get_post_engagement_snapshot_v2(uuid,text)','c6c47f35e631a42387fbbccdb8ee91e0'),
('get_post_engagement_snapshot(uuid)','c26e7a6080a12864962c29527745bb66'),
('get_post_reaction_summaries(uuid[])','238e3b0b62ef1a103aef3a64b60974c7'),
('get_post_reaction_voters_page(uuid,text,integer,timestamp with time zone,uuid)','15a9aee51e28af913d933f034238cc45'),
('get_profile_by_username(text)','15dc7649669efeca00dd3f6fe9161be7'),
('get_public_profile_view(text)','4ce557f6a9301b4f629ab08b77f7f31a'),
('get_push_recipients(uuid[])','9bd00455f4522dc0bd0ae809e70f6c4c'),
('get_reactions_given_count(uuid)','e0131dc29877bf0d6ff0382c7f18d840'),
('get_realtime_token_capabilities(uuid[])','edfc5bd0b0764142bac51660c080d2c1'),
('get_repairable_doji_alarms(integer)','514ed7b9774d56081a1a567b794c77fa'),
('get_upcoming_doji_state()','6119090c489f996be3c0cdfad925b57b'),
('has_pending_own_comment_report(uuid)','2a42cf328d1a4724871f3518af53b28c'),
('hook_enforce_minimum_signup_age(jsonb)','98ae11ef08c78fd4a1fc1f37ac30e3df'),
('increment_grouped_notification_payload(jsonb,text)','7fd7cc9bd92f5c4d07f0b179710d8a35'),
('invalidate_expo_push_token(uuid,text)','327e165e633344f5868c542c61d85018'),
('invalidate_expo_push_tokens(text[])','aa382cd5860a509f6027b674a53e4ec6'),
('invalidate_native_push_tokens(text[])','8323e83f4997dbda0d551dbb924edc30'),
('is_current_user_admin()','f8dc32757009c44efa7fc3fa7e2c1887'),
('is_username_available(text)','093dae4b5e9258c91f021f89240e382f'),
('leaderboard_entry_json(integer,integer,profiles)','bb03167b81f891fc3d3158db74a151ec'),
('level_from_xp(integer)','21590b35a5f51b49da18e615bb7a06ec'),
('list_blocked_users_page(timestamp with time zone,uuid,integer)','c20f4bf7ae7165672c8ab71f67e5b50f'),
('list_doji_push_fanout_shards(uuid)','762189e9ed6101927f631d5c60195b86'),
('list_friend_requests_page(timestamp with time zone,uuid,integer)','70f2ac4ad4f49ee0bff547d6a1ff866e'),
('list_my_friends_page(timestamp with time zone,uuid,integer)','3070d1e53ecbd5e2a129c2cf87933443'),
('list_profile_friends_page(uuid,uuid,integer)','68bb1f395dc1782bc021888b2a9d9ee6'),
('list_profile_friends(uuid)','5cf612a874a655cedc4f8592ce3e7e1b'),
('mark_domain_events_realtime_published(jsonb)','8ddac8afcc7ef0a4c46c608fc74fd243'),
('mark_moderation_notice_read(uuid)','0aee8f855e3674f22f9cea21b5156f68'),
('mark_notification_attention_seen(jsonb)','459a77b8b308335d41e6b5d56ed369e1'),
('mark_notification_center_opened(timestamp with time zone)','9d477ed00c9e23cf8770f289d1fe367d'),
('moderate_report(uuid,text,text)','156fd18070ecde3e9d662f31ca7c6320'),
('next_domain_event_available_at()','415ef3f4acdf0b3ff0ea431068eb4dd8'),
('notification_group_bucket(timestamp with time zone)','bdc678371a26aeefee9b25f7b618d289'),
('persist_signup_legal_acceptance()','00395e9ae1b420c9aff5f0e91ea7c3b7'),
('prepare_next_daily_event(timestamp with time zone,integer)','009b23b28391cd884e1e3daec300aea1'),
('process_friend_fanout_event(uuid)','900271a2c8ebeebe2b444979c85cfcda'),
('profile_reactions_received(uuid)','e69115e2572bcf8b0b590b4557850a04'),
('public_storage_object_path(text,text)','f606e5103878f049913bf3fedaf146b8'),
('publish_account_domain_change()','4f73a85872b87d1a6597a5d966aa3974'),
('publish_admin_suggestion_change()','e786ea649161900c9935f9a586ef5836'),
('publish_core_social_change()','0542950f45882dfcd3908d27425dcfb0'),
('publish_moderation_change()','4c7510ab8cd4f45a5d64e689985fdd4e'),
('publish_poll_vote_like_change()','0d78beceabc0616895e621d0a464880f'),
('publish_private_profile_change()','e034a8ef152262d8963bcef19d81e8e0'),
('publish_public_badge_change()','9375d5a15278786ddf5da6c879451e83'),
('publish_public_profile_change()','f37a5565658802abb863aca4413893cc'),
('publish_reporter_visibility_change()','8b5949194d073ec2468d849d3f6abb62'),
('publish_shop_ownership_change()','89739526425e0980d1a6b7b2bd84d6c1'),
('publish_user_event_change()','f8193235a18282afd1b9472cac0acac6'),
('purchase_shop_item(text)','dffc2a1ede38248ff2c6fc0c9a86dab3'),
('purge_newly_banned_user_content()','daf32131a92304095fff8a3689f03986'),
('purge_posts_older_than_24h()','38709d4add1475ac29877ae5eeff9b6d'),
('queue_deleted_post_media()','4242a669b4afe87547693a59041c5f0a'),
('record_app_announcement_action(uuid,text)','7d41ed8400b2ed79218c1402065e1c15'),
('record_push_delivery_results(jsonb)','60a56e70d8e447271b328b222130182b'),
('refresh_daily_event_health_snapshots_v1(integer)','1aab599e255da40b703dd72a5c05dcf0'),
('register_native_push_endpoint_v2(text,text,text,text,text,smallint)','48b2b96ef1e8c06c314a5d79e1e5fa3d'),
('register_native_push_endpoint_v3(text,text,text,text,text,smallint,text,text,text)','103c54390cd8efa3cc4d91d89d768b81'),
('register_native_push_endpoint(text,text,text,text,text)','a0619cc7204af1a0a47c894cd2af4649'),
('register_push_token(text)','9643647407ac75f82729df0fe1e1fcb5'),
('reject_banned_actor_write()','6bb4741a381bfaa0ea6547c363557ce7'),
('reject_objectionable_ugc()','b33b5b13c0410a337bb498cbbff89074'),
('release_doji_push_fanout_shard(uuid,smallint,uuid,text)','77974889052ef4e2c211c66c9b4412a2'),
('release_domain_event(uuid,uuid,text)','0f52860de5ad5262828ba15c3fbd70f7'),
('release_domain_events_batch(jsonb,text)','52d50b2f21e501b55a4bf15b867bd6e8'),
('remove_friendship(uuid,text)','6048c65c5acbccbffe2a652b26f42402'),
('request_friendship(uuid,text)','4ed4161caf4c1bb1ba8d50f3ee4c95b3'),
('reserve_doji_media_upload(uuid,text,text,text,text)','2df4f5498a73dac21ba50335694d0ad8'),
('respond_to_friendship(uuid,boolean,text)','db19dbf702360ab5b7aaee7cba92842f'),
('retain_moderation_history_on_member_delete()','f7a0a1e3fe81965af172e3f4325c2a3a'),
('review_challenge_suggestion(uuid,text,text,text)','31a2f011fe8851c73ef64ab6f81b63b1'),
('rls_auto_enable()','6998ea6b4c2480f5d2e34b5dcf3f8d36'),
('run_operational_retention_batch(integer)','803c7037cd76afe6c26e2691635ac82f'),
('search_mentionable_profiles(text,integer)','cefea14c8fff106b50faf3a97d58edf3'),
('search_profiles(text,integer)','96d6b8586f049237dde5d1be067380ad'),
('set_comment_like(uuid,boolean,text)','a0392786e95cbc483457c806f7469be6'),
('set_poll_vote_like(uuid,boolean,text)','89acd067071d3ab999ab73d6d1052e1e'),
('set_post_comments_disabled(uuid,boolean,text)','b6d563dec3d65e6c93675498dc6d8d9d'),
('set_post_daily_event_id()','36f61048b979c9e2e40d2df2a6ff00c0'),
('set_post_reaction(uuid,text,boolean,text)','0bf7dda5f195f7efd3a36412e8249732'),
('shields_for_level(integer)','045f561e27e2a64481be99cb5dca10d6'),
('sparks_for_badge_tier(text)','d2ac8385593bb1849593867113b53558'),
('sparks_for_level(integer)','77ee8bfaeb56b58eed48a0cacad1de02'),
('sparks_for_xp(integer)','4dea20462b90c32b1400f6a9454b1181'),
('spend_sparks(uuid,integer,text,text)','60b549f2480f2013a196b5cd7773a8b1'),
('start_targeted_doji_test(text[],integer)','4dae84229faf60f280adeb46d6cfba02'),
('store_apns_provider_token(text,text,uuid,text,timestamp with time zone)','e62a19d52dced7dccb81bafa048a44aa'),
('submit_challenge_suggestion(text,text,text,jsonb,text)','05c755ca779716c47e315c033e977be5'),
('submit_comment(uuid,text,uuid,text)','bfc9420e603b3b15e9690b482e5e4d93'),
('submit_content_report(uuid,uuid,uuid,uuid,text,text)','3a8d7c483ade63d13813fde9bd416d12'),
('submit_moderation_appeal(uuid,text,text)','805ea7be58643664ffcc9d0729dd6eba'),
('submit_policy_report(uuid,uuid,uuid,uuid,text,text,text,text,text)','934b0e2439b392ecf7d9f786eb9323be'),
('submit_poll_vote(uuid,uuid,text,text)','846a3340b10d0704218eeb6d954f99fa'),
('sync_all_badges_for_user(uuid)','708a8d394db280dc191f3aa4f99b7155'),
('sync_badge_category(uuid,text)','7a9514437e8cf0b0dec5ca7c7bde3ef9'),
('sync_comment_mentions(uuid,text,uuid)','6f25f84770f02b015a940d83ae2b7436'),
('sync_notification_center_state(timestamp with time zone,timestamp with time zone,jsonb)','3f17f2f5c4e1aececffd1f8313ba3395'),
('sync_pending_event_expiry()','503ab4a8ce7c9e128559fb1c293af7b3'),
('toggle_comment_like(uuid,text)','553dd85d42352b2ef98fce6301467d75'),
('toggle_poll_vote_like(uuid,text)','46ef83d391b30d678af4e2bf685a6710'),
('toggle_post_reaction(uuid,text,text)','fad76008ad532541af38c81c120adce0'),
('touch_friendship_accepted_at()','56cbcb0d5ce0b8840b65c8406569351d'),
('transfer_push_token_ownership()','03da05ee5c8d961691fab8cd7f42c81c'),
('trg_award_streak_shields()','86f25400f70a1a872744da88c92a8a11'),
('trg_award_tiered_badges()','b890361c928ca437dd9fd38f31695cbd'),
('trg_badge_tier_push()','d4b6e6b9167aab5a80ec008c75c498ad'),
('trg_badge_tier_sparks()','8fff5bfd6e6bf8bdffaa274aef2d18ff'),
('trg_challenge_suggestion_badges()','abd04f671087553a8bdabca50708d7b2'),
('trg_comment_like_push_notify()','ecc72c7f97c3c7c972132f19bc3f2d7f'),
('trg_comment_mention_push()','edb566ea79026d34441721e2cb629b59'),
('trg_comment_push_notify()','81cc107c0acf693b2a384d548560d9ad'),
('trg_daily_event_create_community_poll_post()','5d4b275f5536cd066758af414a3b2a40'),
('trg_daily_participant_shard()','9f27b0e90374fea10a1a8e9620e99bf8'),
('trg_enforce_write_rate_limit()','67a489d1ce8f82c02ebcaf09694ace36'),
('trg_friendship_accepted_push()','eb4718638fc6e3fcf6bcc5b7c08612b6'),
('trg_friendship_post_push()','447e3fa05df93eea0f410a8e4bb1d16a'),
('trg_friendship_request_push()','450f1232105532ceb2883ff21277b073'),
('trg_poll_vote_custom_text()','8126fa2d2fa774045774bc5a5d1f46ad'),
('trg_poll_vote_delete()','9664f575438e90647e8a8f9c50cc2d82'),
('trg_poll_vote_friend_push()','808052e58880de9b8c5365d1b0ee424c'),
('trg_poll_vote_insert()','fd48cc4ac9827f6d6cf8abdb7d038cd7'),
('trg_post_insert_participant()','f42a17e773260760ce679fafffbc375c'),
('trg_profile_fanout_user_events()','32bb729d15b40f0fa9cdad32103a47b6'),
('trg_profile_level_up_sparks()','00f754d7acb15de55550b0d7e0e538bc'),
('trg_profile_welcome_sparks()','7186c8fc869691f832242553967d8197'),
('trg_profile_xp_level()','a737f919d76293654746b893c70ca42f'),
('trg_purge_posts_before_new_challenge()','215fda5865f82cb322b1e4fa6882ba9f'),
('trg_purge_posts_when_event_activates()','d8f6c7ddd3ddba248ad30544faa1652f'),
('trg_reaction_delete()','436d388677916dd5b8ca8298c8076e30'),
('trg_reaction_emoji_update()','51a08b8724833590db076f2bd923f6a7'),
('trg_reaction_insert()','19bb41172fa7e7b53316d20b65c50043'),
('trg_reaction_push_notify()','d5d869021d94b8a2a52f15ff6ee55b88'),
('trg_reactions_given_inc()','53b62dc714fffb1b26995736635c507e'),
('trg_report_notify_admin()','68dff33a85dfb66468328a7abf2ae36d'),
('trg_sparks_comment()','d14b24a1bf7cac489b2b443e778bd7ae'),
('trg_sparks_friend_accept()','91a7cbe11f6c0fbc1759a191290d4e9f'),
('trg_sparks_friend_request()','7c2468840187f096d6117e74589e10ee'),
('trg_sparks_poll_vote()','4f71751cc60183f8ef53a99e55fcd8ed'),
('trg_sparks_post()','90138c5a6d37dacb857473e3f372b25d'),
('trg_sparks_reaction()','28e2bf423900f813ffb16bc103b7ae41'),
('trg_sparks_suggestion_approved()','13d0ac6f83972a5bd8b78e66688a362d'),
('trg_suggestion_review_push()','1441a50a1ba02a8f06514061139aaa1b'),
('trg_sync_friend_badges()','9339dfdc08163af0095a62bc3a1273cc'),
('trg_sync_poll_badge()','e0e03847f77ccfb8b34c02e13dc8aed8'),
('trg_sync_profile_badges()','415e94945a9c98a90b8236b3bbef4716'),
('trg_sync_suggestion_badges()','f9de2059ad3673f5a59de20fbbc3f095'),
('trg_user_badge_push()','be391432e6e429ac3d5b7a0335b4c6c1'),
('trg_user_event_complete()','a25355bbd6734be9f8feaa37664c2b31'),
('trg_user_event_completion_push()','1e017170125e5b9e9cdb1f7b6e401a6d'),
('unblock_user(uuid,text)','3c635d3e24c42627c67aace9b4e9c060'),
('unregister_push_installation(text,text)','2841677d2a6a6444d0f4cbfda9f97a05'),
('unregister_push_token()','d79aeb52e5221dcd1584c1ae2be24101'),
('update_comment_count()','e2ab99a3893b77884cfaa24685dc3f73'),
('update_comment_like_count()','66d81f4faf929549efa3063b3cfa0c90'),
('update_own_profile(jsonb,text)','e756d053182b5317262dcfe51b2a7f36'),
('update_reaction_count()','7f7f0a45e53ad1085a2ed85afee808f8'),
('update_updated_at()','52d2d37f07a68e8071645e9dba84cd09'),
('upsert_badge_tier(uuid,text,text)','bb9a61920c4ff3891cb69fd817245880'),
('user_end_of_day(uuid)','ace06dd77e5476b72c5c512b82d0b180'),
('users_are_blocked(uuid,uuid)','151c1f238b4cf60d68682764c75485da'),
('validate_format_post_caption()','894487a3bcab73e46260031f1713444d'),
('viewer_completed_today(uuid)','af19fbaf4beba6b66e694571b05c7caa'),
('viewer_relationship_status(uuid)','6305305e579a36011b4fc312e4e66204'),
('wake_domain_event_relay()','b46bec0304caaf2266835988afc2fc04');
do $$begin
 if exists(select 1 from employee_release_expected e where to_regprocedure(e.signature) is null
    or md5(pg_get_functiondef(to_regprocedure(e.signature)))<>e.fingerprint) then
   raise exception 'Employee release stopped: production function drift'; end if;
end$$;
create temporary table employee_release_member_functions on commit drop as
select p.oid,p.oid::regprocedure::text signature, md5(pg_get_functiondef(p.oid)) fingerprint,
 has_function_privilege('authenticated',p.oid,'EXECUTE') member_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute
from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';
create temporary table employee_release_member_tables on commit drop as
select c.oid,c.relrowsecurity,c.relforcerowsecurity,r.role,v.privilege,has_table_privilege(r.role,c.oid,v.privilege) allowed
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values('authenticated'),('anon')) r(role)
cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRIGGER')) v(privilege)
where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m');
create temporary table employee_release_member_policies on commit drop as
select * from pg_policies where schemaname in ('public','storage');

-- Requires the separately released deletion repair. Do not make a historical
-- actor's member account undeletable again when moving actor FKs to Auth.
do $$ begin
  if to_regclass('public.admin_deleted_member_references') is null then
    raise exception 'Account deletion repair must be installed first';
  end if;
end $$;
create table public.admin_employee_cutover (
  singleton boolean primary key default true check(singleton),
  employee_only boolean not null default false
);
insert into public.admin_employee_cutover values(true,false);
alter table public.admin_employee_cutover enable row level security;
revoke all on public.admin_employee_cutover from public,anon,authenticated,doji_employee;

alter function public.admin_user_has_permission(text) rename to legacy_admin_user_has_permission_20260926;
revoke all on function public.legacy_admin_user_has_permission_20260926(text) from public,anon,authenticated,doji_employee;
create function public.admin_user_has_permission(p_permission text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare staff public.admin_employees%rowtype;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee' then
    if (select employee_only from public.admin_employee_cutover where singleton) then return false; end if;
    return public.legacy_admin_user_has_permission_20260926(p_permission);
  end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then return false; end if;
  select * into staff from public.admin_employees where id=auth.uid() and status='active';
  if not found then return false; end if;
  return 'super_admin'=any(staff.roles) or
    (p_permission='portal.session' and cardinality(staff.roles)>0) or
    (p_permission='operations.read' and 'operations'=any(staff.roles)) or
    (p_permission in ('moderation.read','moderation.write') and staff.roles && array['operations','moderator']) or
    (p_permission='legal.read' and staff.roles && array['operations','legal_reviewer']) or
    (p_permission='business.read' and staff.roles && array['operations','business_reviewer']);
end;
$$;
revoke all on function public.admin_user_has_permission(text) from public,anon;
grant execute on function public.admin_user_has_permission(text) to authenticated,doji_employee;

alter function public.admin_current_operator_role() rename to legacy_admin_current_operator_role_20260926;
create function public.admin_current_operator_role()
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.jwt()->>'role'='doji_employee' then
    return (select r from public.admin_employees e, unnest(e.roles) r where e.id=auth.uid() and e.status='active'
      order by array_position(array['super_admin','operations','moderator','legal_reviewer','business_reviewer'],r) limit 1);
  end if;
  return public.legacy_admin_current_operator_role_20260926();
end;
$$;
revoke all on function public.admin_current_operator_role() from public,anon,authenticated,doji_employee;

-- Staff actors are Auth identities, not social profiles. Existing actor UUIDs
-- remain untouched and retain their historical identity. Targets stay members.
do $$
declare item record; constraint_row record;
begin
  for item in select * from (values
    ('admin_audit_log','actor_id','SET NULL'),
    ('admin_report_triage','assigned_to','SET NULL'),
    ('admin_report_triage','resolved_by','SET NULL'),
    ('moderation_decisions','decided_by','SET NULL'),
    ('moderation_decisions','reversed_by','SET NULL'),
    ('moderation_appeals','reviewed_by','SET NULL')
  ) as refs(table_name,column_name,on_delete) loop
    execute format('alter table public.%I alter column %I drop not null',item.table_name,item.column_name);
    for constraint_row in select c.conname from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
      where c.conrelid=format('public.%I',item.table_name)::regclass and c.contype='f'
        and a.attname=item.column_name and c.confrelid='public.profiles'::regclass
    loop
      execute format('alter table public.%I drop constraint %I',item.table_name,constraint_row.conname);
    end loop;
    execute format('alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete %s',
      item.table_name,item.table_name||'_'||item.column_name||'_employee_fkey',item.column_name,item.on_delete);
  end loop;
end;
$$;

alter table public.admin_report_triage add column if not exists deleted_member_refs jsonb not null default '{}';
create index if not exists admin_triage_assignee_deletion_idx on public.admin_report_triage(assigned_to);
create index if not exists admin_triage_resolver_deletion_idx on public.admin_report_triage(resolved_by);

-- Auth FKs can be cleared before the profile cascade runs. Capture actor UUIDs
-- at the parent BEFORE DELETE boundary, independent of FK-trigger ordering.
-- Only attribution is added: prior action/reason/metadata and outcomes survive.
create function public.retain_deleted_admin_actor_history_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare item record; affected integer; retained boolean := false;
begin
  for item in select * from (values
    ('admin_audit_log','actor_id'),('admin_report_triage','assigned_to'),
    ('admin_report_triage','resolved_by'),('moderation_decisions','decided_by'),
    ('moderation_decisions','reversed_by'),('moderation_appeals','reviewed_by')
  ) refs(table_name,column_name) loop
    -- Detach in this BEFORE trigger, not later in Auth's SET NULL triggers:
    -- the profile cascade also updates history rows and can recheck an actor FK
    -- after the Auth parent is gone but before its FK trigger has run.
    execute format('update public.%I set deleted_member_refs=deleted_member_refs || jsonb_build_object(%L,$1::text), %I=null where %I=$1',
      item.table_name,item.column_name,item.column_name,item.column_name) using old.id;
    get diagnostics affected = row_count;
    retained := retained or affected > 0;
  end loop;
  if retained then
    insert into public.admin_deleted_member_references(member_id) values(old.id) on conflict do nothing;
  end if;
  return old;
end;
$$;
revoke all on function public.retain_deleted_admin_actor_history_v1() from public,anon,authenticated,doji_employee;
create trigger retain_deleted_admin_actor_history before delete on auth.users
  for each row execute function public.retain_deleted_admin_actor_history_v1();

create view public.admin_actor_directory as
  select id,username,display_name,avatar_url from public.profiles
  union all
  select id,'employee-'||left(id::text,8),display_name,null::text from public.admin_employees;
revoke all on public.admin_actor_directory from public,anon,authenticated,doji_employee;
-- Only operator identity joins in existing portal read functions are changed.
-- Never replace reported-member, reporter, submitter or content-author joins.
do $$
declare item record; rewritten text;
begin
  for item in select p.oid,pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'get_admin_%' and p.prokind='f'
  loop
    rewritten := regexp_replace(item.definition,
      'join public[.]profiles (owner|actor|viewer|resolver|decider) on',
      'join public.admin_actor_directory \1 on','g');
    rewritten := replace(rewritten,'join public.profiles profile on profile.id = audit.actor_id',
      'join public.admin_actor_directory profile on profile.id = audit.actor_id');
    if rewritten <> item.definition then execute rewritten; end if;
  end loop;
end;
$$;

alter function public.get_admin_portal_session() rename to legacy_admin_portal_session_20260926;
revoke all on function public.legacy_admin_portal_session_20260926() from public,anon,authenticated,doji_employee;
create function public.get_admin_portal_session()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare employee public.admin_employees%rowtype;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee' then
    if (select employee_only from public.admin_employee_cutover where singleton) then
      raise exception 'Employee account required' using errcode='42501'; end if;
    return public.legacy_admin_portal_session_20260926();
  end if;
  if not public.admin_user_has_permission('portal.session') then raise exception 'Approved employee and MFA required' using errcode='42501'; end if;
  select * into employee from public.admin_employees where id=auth.uid();
  return jsonb_build_object('user_id',employee.id,'username','employee-'||left(employee.id::text,8),
    'display_name',employee.display_name,'avatar_url',null,'roles',to_jsonb(employee.roles),
    'account_type','employee','aal',auth.jwt()->>'aal','read_only',false,'server_time',clock_timestamp());
end;
$$;
revoke all on function public.get_admin_portal_session() from public,anon;
grant execute on function public.get_admin_portal_session() to authenticated,doji_employee;

create function public.get_admin_employee_directory_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee' or not public.admin_user_has_permission('admin.manage') then
    raise exception 'Employee super administrator required' using errcode='42501'; end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'user_id',e.id,'username',u.email,'display_name',e.display_name,'avatar_url',null,
    'status',e.status,'roles',e.roles,'is_founder_admin',false,'is_banned',e.status='disabled',
    'last_changed_at',e.updated_at) order by e.created_at desc)
    from (select * from public.admin_employees order by created_at desc limit 100) e
    join auth.users u on u.id=e.id),'[]'::jsonb));
end;
$$;

create function public.admin_set_employee_role_v1(p_username text,p_role text,p_active boolean,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare employee public.admin_employees%rowtype; before_state jsonb; after_state jsonb; previous public.admin_employee_access_events%rowtype;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee' or not public.admin_user_has_permission('admin.manage') then
    raise exception 'Employee super administrator required' using errcode='42501'; end if;
  if p_role is null or p_role not in ('super_admin','operations','moderator','legal_reviewer','business_reviewer')
    or p_active is null then raise exception 'Choose an employee role and action'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 10 and 1000
    or char_length(btrim(coalesce(p_idempotency_key,''))) not between 12 and 160 then raise exception 'Reason and request ID required'; end if;
  -- Serialize access changes, including last-super-admin protection and replays.
  perform pg_catalog.pg_advisory_xact_lock(92610001);
  select e.* into employee from public.admin_employees e join auth.users u on u.id=e.id
    where lower(u.email)=lower(btrim(p_username)) and u.role='doji_employee' and u.email_confirmed_at is not null for update of e;
  if not found then raise exception 'Verified employee not found'; end if;
  select * into previous from public.admin_employee_access_events where actor_id=auth.uid() and request_id=p_idempotency_key;
  if found then
    if previous.employee_id<>employee.id or previous.next_state->>'changed_role'<>p_role
       or (previous.next_state->>'granted')::boolean is distinct from p_active
       or previous.reason is distinct from btrim(p_reason) then raise exception 'Request ID already used'; end if;
    return previous.next_state;
  end if;
  before_state:=jsonb_build_object('status',employee.status,'roles',employee.roles);
  if p_active then
    employee.roles:=array(select distinct r from unnest(employee.roles||array[p_role]) r order by r);
    employee.status:='active';
  else
    if p_role='super_admin' and 'super_admin'=any(employee.roles) and not exists(
      select 1 from public.admin_employees where id<>employee.id and status='active' and 'super_admin'=any(roles)) then
      raise exception 'At least one employee super administrator must remain'; end if;
    employee.roles:=array_remove(employee.roles,p_role);
    if cardinality(employee.roles)=0 then employee.status:='disabled'; end if;
  end if;
  update public.admin_employees set roles=employee.roles,status=employee.status,updated_at=clock_timestamp() where id=employee.id;
  after_state:=jsonb_build_object('status',employee.status,'roles',employee.roles,'changed_role',p_role,'granted',p_active);
  insert into public.admin_employee_access_events(actor_id,employee_id,action,reason,request_id,previous_state,next_state)
    values(auth.uid(),employee.id,'employee.access_changed',btrim(p_reason),p_idempotency_key,before_state,after_state);
  insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,request_id,metadata)
    values(auth.uid(),'super_admin','employee.access_changed','employee',employee.id::text,btrim(p_reason),
      p_idempotency_key,jsonb_build_object('before',before_state,'after',after_state));
  perform public.enqueue_domain_event('moderation:global','moderation.employee.access_changed',employee.id,
    jsonb_build_object('version',1,'employeeId',employee.id),null);
  return after_state;
end;
$$;
revoke all on function public.get_admin_employee_directory_v1(), public.admin_set_employee_role_v1(text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.get_admin_employee_directory_v1(), public.admin_set_employee_role_v1(text,text,boolean,text,text) to doji_employee;

-- Exact allowlist, not ALL FUNCTIONS. Internal helpers stay uncallable.
do $$
declare item record;
begin
  for item in select p.oid::regprocedure as signature from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
      'get_admin_portal_session_v3','get_admin_command_center_snapshot_v2','get_admin_report_case_v2',
      'get_admin_work_queue_page_v1','get_admin_resolved_reports_page_v1','get_admin_audit_page_v2',
      'get_admin_audit_export_v1','get_admin_event_health_history_v1','get_admin_operational_health_read_v1',
      'get_admin_appeals_snapshot','get_admin_realtime_token_capabilities',
      'admin_triage_report','admin_set_report_review_state_v1','admin_decide_report_v3','admin_review_moderation_appeal'])
  loop execute format('grant execute on function %s to doji_employee',item.signature); end loop;
end;
$$;

-- BEGIN EMPLOYEE COMMAND RECEIPTS
-- Member command_receipts has a profiles FK. Keep that table, grants and member
-- commands untouched; employee administrative commands need their own ledger.
create table public.admin_employee_command_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,idempotency_key)
);
alter table public.admin_employee_command_receipts enable row level security;
revoke all on public.admin_employee_command_receipts from public,anon,authenticated,doji_employee;
create view public.admin_portal_command_receipts as
  select * from public.command_receipts where auth.jwt()->>'role' is distinct from 'doji_employee'
  union all
  select * from public.admin_employee_command_receipts where auth.jwt()->>'role'='doji_employee';
revoke all on public.admin_portal_command_receipts from public,anon,authenticated,doji_employee;
create function public.route_admin_command_receipt_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_table text;
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Receipt actor must match caller'; end if;
  target_table:=case when auth.jwt()->>'role'='doji_employee'
    then 'admin_employee_command_receipts' else 'command_receipts' end;
  if tg_op='INSERT' then
    new.created_at:=coalesce(new.created_at,clock_timestamp());
    execute format('insert into public.%I(user_id,idempotency_key,result,created_at) values($1,$2,$3,$4)',target_table)
      using new.user_id,new.idempotency_key,new.result,new.created_at;
  elsif tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id or new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'Receipt identity is immutable'; end if;
    execute format('update public.%I set result=$3 where user_id=$1 and idempotency_key=$2',target_table)
      using old.user_id,old.idempotency_key,new.result;
  end if;
  return new;
end;
$$;
revoke all on function public.route_admin_command_receipt_v1() from public,anon,authenticated,doji_employee;
create trigger route_admin_command_receipt instead of insert or update on public.admin_portal_command_receipts
  for each row execute function public.route_admin_command_receipt_v1();
-- Explicit portal-only command inventory, including delegated legacy bodies.
-- Existing advisory locks, idempotency keys, receipts and atomicity are retained.
do $$
declare item record; rewritten text;
begin
  for item in select pg_get_functiondef(p.oid) definition from pg_proc p
    where p.pronamespace='public'::regnamespace and p.proname=any(array[
      'admin_decide_report_v2_legacy_20260924','admin_decide_report_v3',
      'admin_review_moderation_appeal_before_account_restrictions_2026',
      'admin_set_report_review_state_v1','admin_triage_report_before_restricted_guard_20260924'])
  loop
    rewritten:=replace(item.definition,'public.command_receipts','public.admin_portal_command_receipts');
    if rewritten<>item.definition then execute rewritten; end if;
  end loop;
end;
$$;
-- END EMPLOYEE COMMAND RECEIPTS

-- Employee evidence access has its own Storage policy; member policies/grants
-- are unchanged. No employee upload, update or delete privilege is granted.
grant usage on schema storage to doji_employee;
grant select on storage.objects to doji_employee;
-- Bind the viewer server-side. Do not expose the shared helper's arbitrary
-- viewer parameter or require employee USAGE on the managed Auth schema.
create function public.employee_can_read_report_evidence_v1(p_object_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.jwt()->>'role'='doji_employee'
    and public.admin_user_has_permission('moderation.read')
    and exists (
      select 1 from public.reports report
      join public.posts post on post.id=report.post_id
      left join public.admin_report_triage triage on triage.report_id=report.id
      where report.status in ('pending','dismissed','actioned')
        and (coalesce(triage.queue,'moderation')='moderation'
          or (triage.queue='restricted_safety' and public.admin_user_has_permission('legal.read')))
        and (public.public_storage_object_path(post.photo_url,'post-media')=p_object_path
          or public.public_storage_object_path(post.front_photo_url,'post-media')=p_object_path
          or public.public_storage_object_path(post.video_url,'post-media')=p_object_path)
    );
$$;
revoke all on function public.employee_can_read_report_evidence_v1(text) from public,anon,authenticated;
grant execute on function public.employee_can_read_report_evidence_v1(text) to doji_employee;
create policy employee_report_evidence_read on storage.objects for select to doji_employee
  using (bucket_id='post-media' and public.employee_can_read_report_evidence_v1(name));
-- Existing PUBLIC Storage policies are shared infrastructure. Restrict only the
-- employee role so permissive PUBLIC policies cannot broaden evidence access.
create policy employee_report_evidence_boundary on storage.objects as restrictive for select to doji_employee
  using (bucket_id='post-media' and public.employee_can_read_report_evidence_v1(name));

-- No client can turn off the migration gate. Enable only after all live checks
-- and the owner MFA test; this leaves legacy records intact for rollback.
create function public.activate_employee_portal_v1()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(92610001);
  if not exists(select 1 from public.admin_employees e join auth.mfa_factors f on f.user_id=e.id
    where e.status='active' and 'super_admin'=any(e.roles) and f.status='verified') then
    raise exception 'An active employee super administrator with verified MFA is required'; end if;
  update public.admin_employee_cutover set employee_only=true where singleton;
end;
$$;
revoke all on function public.activate_employee_portal_v1() from public,anon,authenticated,doji_employee;
grant execute on function public.activate_employee_portal_v1() to service_role;

-- BEGIN EMPLOYEE MODERATION RATE LIMITS
-- Owner-approved shared-trigger dispatch. The member helper, ledger, limits and
-- caller identity are unchanged. Two bounded buckets per employee, not a second
-- member profile or an unbounded history requiring a new maintenance job.
create table public.admin_employee_rate_limits (
  employee_id uuid not null references public.admin_employees(id) on delete cascade,
  action text not null check (action in ('comment','poll_vote')),
  bucket_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key(employee_id,action)
);
alter table public.admin_employee_rate_limits enable row level security;
revoke all on public.admin_employee_rate_limits from public,anon,authenticated,doji_employee;
create function public.enforce_employee_moderation_rate_limit_v1(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); bucket_start timestamptz; observed_count integer; request_limit integer;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee'
    or auth.jwt()->>'aal' is distinct from 'aal2'
    or not public.admin_user_has_permission('moderation.write') then
    raise exception 'Approved employee moderator and MFA required' using errcode='42501';
  end if;
  request_limit := case p_action when 'comment' then 30 when 'poll_vote' then 10 end;
  if request_limit is null then raise exception 'Invalid employee moderation budget'; end if;
  bucket_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / 60) * 60);
  insert into public.admin_employee_rate_limits(employee_id,action,bucket_started_at,request_count)
    values(uid,p_action,bucket_start,1)
    on conflict(employee_id,action) do update set
      request_count=case when admin_employee_rate_limits.bucket_started_at=excluded.bucket_started_at
        then admin_employee_rate_limits.request_count+1 else 1 end,
      bucket_started_at=excluded.bucket_started_at
    returning request_count into observed_count;
  if observed_count > request_limit then
    raise exception using errcode='P0001', message='Too many moderation actions. Please wait a moment and try again.',
      detail='employee_rate_limited:'||p_action,
      hint='retry_after_seconds='||greatest(1,ceil(extract(epoch from bucket_start+interval '60 seconds'-clock_timestamp()))::integer)::text;
  end if;
end;
$$;
revoke all on function public.enforce_employee_moderation_rate_limit_v1(text) from public,anon,authenticated,doji_employee;
create or replace function public.trg_enforce_write_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt()->>'role'='doji_employee' then
    -- Employee table writes remain denied. Only existing audited moderation RPCs
    -- can reach this branch; allow status-only updates on these two exact tables.
    if tg_table_schema<>'public' or tg_table_name not in ('comments','poll_votes')
      or tg_op<>'UPDATE' then
      raise exception 'Employee write outside moderation boundary' using errcode='42501';
    end if;
    if (to_jsonb(new)-'moderation_status') is distinct from (to_jsonb(old)-'moderation_status') then
      raise exception 'Employee moderation may only change content visibility' using errcode='42501';
    end if;
    perform public.enforce_employee_moderation_rate_limit_v1(
      case tg_table_name when 'comments' then 'comment' else 'poll_vote' end);
  else
    perform public.enforce_api_rate_limit(
      tg_argv[0],tg_argv[1]::integer,coalesce(nullif(tg_argv[2], '')::integer,60));
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
-- END EMPLOYEE MODERATION RATE LIMITS

-- Fail closed on legacy PUBLIC/default grants. NOINHERIT does not remove PUBLIC
-- privileges. Never silently revoke a shared member grant to make this pass.
do $$
declare exposed text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into exposed
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and has_function_privilege('doji_employee',p.oid,'EXECUTE')
    and p.proname <> all(array[
      'get_employee_registration_status_v1','admin_user_has_permission','get_admin_portal_session',
      'get_admin_employee_directory_v1','admin_set_employee_role_v1','employee_can_read_report_evidence_v1',
      'get_admin_portal_session_v3','get_admin_command_center_snapshot_v2','get_admin_report_case_v2',
      'get_admin_work_queue_page_v1','get_admin_resolved_reports_page_v1','get_admin_audit_page_v2',
      'get_admin_audit_export_v1','get_admin_event_health_history_v1','get_admin_operational_health_read_v1',
      'get_admin_appeals_snapshot','get_admin_realtime_token_capabilities','admin_triage_report',
      'admin_set_report_review_state_v1','admin_decide_report_v3','admin_review_moderation_appeal'])
    -- Reviewed September 26 against the production schema-only export. These
    -- existing PUBLIC helpers are argument-only immutable calculators or
    -- SECURITY INVOKER trigger functions (not callable as ordinary RPCs).
    -- Employees have no member-table or TRIGGER grants. Preserve member grants;
    -- any body/signature/security/return-type change requires another review.
    and not exists (
      select 1 from (values
        ('level_from_xp(integer)','38926c89498cd4a777f07c619f76839f','integer','i'),
        ('shields_for_level(integer)','471825f64f24c04e36bf7d99387b4920','integer','i'),
        ('sparks_for_badge_tier(text)','2d9e9736db15346df8b18513ff2d1147','integer','i'),
        ('sparks_for_level(integer)','05c86e4d237bfefe02e645a52e5e8fc7','integer','i'),
        ('sparks_for_xp(integer)','1e41fe5ac4224300576b72b7f01f9f4a','integer','i'),
        ('comments_enforce_parent()','58832d4c0193e9ec5f028865724becd5','trigger','v'),
        ('touch_friendship_accepted_at()','11100be9f2fa8d9b1e6d525573703d74','trigger','v'),
        ('trg_award_streak_shields()','52addff1cfceaa19c0706905a48ea509','trigger','v'),
        ('trg_poll_vote_custom_text()','39b55951bd504f4586ea0cc4552b3a1e','trigger','v'),
        ('trg_profile_xp_level()','3cb143245e6f3ec95db10990217b5788','trigger','v'),
        ('update_updated_at()','204b9b9355e61b7541bc0633bbc9294c','trigger','v'),
        ('validate_format_post_caption()','4a6ddbf25ca687fd0257dcb6868a9d25','trigger','v')
      ) reviewed(signature,source_hash,return_type,volatility)
      where p.oid=to_regprocedure('public.'||reviewed.signature)
        and md5(p.prosrc)=reviewed.source_hash and not p.prosecdef
        and p.prorettype=to_regtype(reviewed.return_type)
        and p.provolatile::text=reviewed.volatility
        and p.prolang in (select oid from pg_catalog.pg_language where lanname in ('sql','plpgsql'))
    );
  if exposed is not null then raise exception 'Employee isolation preflight: unexpected RPC access: %', exposed; end if;
  select string_agg(c.oid::regclass::text, ', ') into exposed
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','v','m','p')
    and has_table_privilege('doji_employee',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if exposed is not null then raise exception 'Employee isolation preflight: unexpected table access: %', exposed; end if;
end;
$$;

do $$begin
 if exists(select 1 from employee_release_member_functions b
   where b.member_execute<>has_function_privilege('authenticated',to_regprocedure(b.signature),'EXECUTE')
      or b.anon_execute<>has_function_privilege('anon',to_regprocedure(b.signature),'EXECUTE')) then
   raise exception 'Employee release stopped: member RPC grant changed'; end if;
 if exists(select 1 from employee_release_member_functions b
   where b.fingerprint<>md5(pg_get_functiondef(to_regprocedure(b.signature)))
   and b.signature !~ '^(get_admin_|trg_enforce_write_rate_limit\(\)$|admin_user_has_permission\(|admin_current_operator_role\(|admin_decide_report_v2_legacy_20260924\(|admin_decide_report_v3\(|admin_review_moderation_appeal_before_account_restrictions_2026\(|admin_set_report_review_state_v1\(|admin_triage_report_before_restricted_guard_20260924\()') then
   raise exception 'Employee release stopped: non-portal function changed'; end if;
 if exists(select 1 from employee_release_member_tables b join pg_class c on c.oid=b.oid
   where b.allowed<>has_table_privilege(b.role,b.oid,b.privilege)
     or b.relrowsecurity<>c.relrowsecurity or b.relforcerowsecurity<>c.relforcerowsecurity) then
   raise exception 'Employee release stopped: member table grant or RLS changed'; end if;
 if exists((select * from employee_release_member_policies except select * from pg_policies)
   union all (select * from pg_policies where schemaname in ('public','storage')
     and policyname not in ('employee_report_evidence_read','employee_report_evidence_boundary')
     except select * from employee_release_member_policies)) then
   raise exception 'Employee release stopped: existing policy changed'; end if;
end$$;
notify pgrst, 'reload schema';

commit;


