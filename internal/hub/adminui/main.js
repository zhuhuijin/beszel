/**
 * PocketBase superuser UI Chinese localization.
 *
 * Registered as a PocketBase UI extension (core.UIExtension) by the hub and
 * auto-loaded by the admin UI via /_/extensions.js. Translates UI chrome at
 * runtime with an en->zh dictionary; unmatched strings fall back to English.
 *
 * Language resolution: the toggle button (localStorage "pb_admin_lang") wins,
 * then the Beszel site language setting (same-origin localStorage "lang"),
 * then the browser locale. Unmatched strings fall back to English.
 */
(function () {
	'use strict'

	const LANG_KEY = 'pb_admin_lang'

	let lang = 'en'
	try {
		const manual = localStorage.getItem(LANG_KEY)
		if (manual) {
			// explicit toggle on the admin page wins
			lang = manual
		} else if (localStorage.getItem('lang')) {
			// follow the Beszel site language setting (same-origin localStorage "lang")
			lang = /^zh/i.test(localStorage.getItem('lang')) ? 'zh' : 'en'
		} else {
			lang = /^zh/i.test(navigator.language || '') ? 'zh' : 'en'
		}
	} catch (e) {
		lang = /^zh/i.test(navigator.language || '') ? 'zh' : 'en'
	}
	const enabled = lang === 'zh'

	// --------------------------------------------------------------------
	// Dictionary: exact matches (also used for placeholder/title/aria-label).
	// --------------------------------------------------------------------
	const dict = {
		// sidebar / navigation
		'Collections': '集合',
		'Logs': '日志',
		'Settings': '设置',
		'Application': '应用',
		'Mail settings': '邮件设置',
		'Files storage': '文件存储',
		'Backups': '备份',
		'Crons': '定时任务',
		'Export collections': '导出集合',
		'Import collections': '导入集合',
		'SQL console': 'SQL 控制台',
		'Light': '浅色',
		'Dark': '深色',
		'Auto': '自动',
		'Docs': '文档',
		'Logout': '退出登录',
		'Toggle sidebar': '收起/展开侧边栏',
		'Toggle columns': '切换显示列',
		'Loading plugins...': '正在加载插件...',
		'Loading...': '加载中...',
		'Please wait...': '请稍候...',

		// common buttons / actions
		'Save': '保存',
		'Save changes': '保存更改',
		'Save and continue': '保存并继续',
		'Cancel': '取消',
		'Close': '关闭',
		'Close popup': '关闭弹窗',
		'Confirm': '确认',
		'Copy': '复制',
		'Copied': '已复制',
		'Clear': '清除',
		'Refresh': '刷新',
		'Remove': '移除',
		'Remove file': '移除文件',
		'Remove rule': '移除规则',
		'Reset': '重置',
		'Restore': '恢复',
		'Execute': '执行',
		'Manage': '管理',
		'Delete': '删除',
		'Check': '检查',
		'Preview': '预览',
		'Download': '下载',
		'Send': '发送',
		'Submit': '提交',
		'Verify': '验证',
		'Show password': '显示密码',
		'Hide password': '隐藏密码',
		'Show details': '显示详情',
		'Hide details': '隐藏详情',
		'Show more options': '显示更多选项',
		'Hide more options': '隐藏更多选项',
		'More options': '更多选项',
		'Open in new tab': '在新标签页打开',
		'Yes, delete': '确认删除',
		'Yes, discard': '确认放弃',
		'Yes, save changes': '确认保存更改',
		'Something went wrong!': '出错了！',
		'Something went wrong.': '发生了一些错误。',
		'Failed to copy.': '复制失败。',
		'Has unsaved changes': '有未保存的更改',
		'You have unsaved changes. Do you really want to discard them?': '有未保存的更改，确定要放弃吗？',
		'An error occurred while validating the submitted data.': '校验提交的数据时出错。',
		'Only superusers can perform this action.': '仅超级用户可执行此操作。',
		'Missing required value.': '缺少必填值。',
		'Must be a valid email address.': '必须是有效的邮箱地址。',
		'- Select -': '- 请选择 -',
		'Select field': '选择字段',
		'Select query': '选择查询',
		'No items found': '未找到条目',
		'Item': '条目',
		'N/A': '暂无',
		'New record': '新增记录',
		'System': '系统',
		'Debug': '调试',
		'Accent': '强调色',
		'Enabled': '已启用',
		'Disabled': '已禁用',
		'Level': '级别',
		'Message': '消息',
		'Color scheme': '配色方案',
		'By default PocketBase uses and recommends the local file system to store uploaded files because it is more performant, easier to manage and backup.': '默认情况下，PocketBase 使用并推荐本地文件系统存储上传的文件，性能更好、更易于管理和备份。',
		'Alternatively, if you have limited disk space available, you could opt to an S3 compatible external storage.': '此外，如果磁盘空间有限，也可以选择 S3 兼容的外部存储。',

		// login / installer / account pages
		'Superuser login': '超级用户登录',
		'Email': '邮箱',
		'Password': '密码',
		'Confirm password': '确认密码',
		'Login': '登录',
		'Forgotten password': '忘记密码',
		'Forgotten superuser password': '忘记超级用户密码',
		"Enter the email associated with your account and we'll send you a recovery link:": '输入你账户关联的邮箱，我们将向你发送恢复链接：',
		'Setup your PocketBase instance': '初始化你的 PocketBase 实例',
		'Invalid login credentials.': '登录凭据无效。',
		'Failed to authenticate.': '认证失败。',
		'Auth completed.': '认证完成。',
		'Auth failed.': '认证失败。',
		'New password': '新密码',
		'New password confirm': '确认新密码',
		'The email was successfully changed.': '邮箱更换成功。',
		'The password was successfully changed.': '密码修改成功。',
		'Successfully verified': '验证成功',
		'Please check your email for the new verification link.': '请查收邮箱中的新验证链接。',
		'You can go back and sign in with your new email address.': '现在可以使用新邮箱地址重新登录。',
		'You can go back to sign in with your new password.': '现在可以使用新密码重新登录。',
		'You can close this window and go back to the app to try again.': '你可以关闭此窗口并返回应用重试。',
		'You can close this window and go back to the app.': '你可以关闭此窗口并返回应用。',
		'Confirm verification': '确认验证',
		'Confirm password reset': '确认密码重置',
		'Confirm email change': '确认邮箱变更',
		'Request verification': '请求验证',
		'Request password reset': '请求重置密码',
		'Request email change': '请求更换邮箱',
		'Invalid or expired verification token.': '验证令牌无效或已过期。',
		'Invalid or expired password reset token.': '密码重置令牌无效或已过期。',
		'Invalid or expired email change token.': '邮箱变更令牌无效或已过期。',
		'The installer token is invalid or has expired.': '安装令牌无效或已过期。',
		'One-time password': '一次性密码',
		'One-time password (OTP)': '一次性密码 (OTP)',
		'Request another OTP': '重新获取 OTP',
		"You've send too many OTP requests, please try again later.": 'OTP 请求过于频繁，请稍后再试。',

		// auth / tokens / MFA
		'Auth with password': '密码登录',
		'Auth with OTP': '一次性密码登录',
		'Auth with OAuth2': 'OAuth2 登录',
		'Auth methods': '认证方式',
		'Auth providers': '认证提供方',
		'Auth collection': '认证集合',
		'Auth': '认证',
		'Multi-factor authentication (MFA)': '多因素认证 (MFA)',
		'Enabled for everyone': '对所有人启用',
		'Not enabled for the collection': '该集合未启用',
		'Leave empty to require MFA for everyone': '留空表示对所有人要求 MFA',
		'Leave the rule empty to require MFA for everyone.': '规则留空表示对所有人要求 MFA。',
		'Max duration between 2 authentications (in seconds)': '两次认证的最大间隔（秒）',
		'This optional rule could be used to enable/disable MFA per account basis.': '该可选规则可用于按账户启用/禁用 MFA。',
		'Superusers can have OTP only as part of Two-factor authentication.': '超级用户的 OTP 仅能作为两步验证的一部分。',
		'OTP auth': 'OTP 认证',
		'OTP request': 'OTP 请求',
		'Token options (invalidate, duration)': '令牌选项（失效、有效期）',
		'Invalidate all previously issued tokens': '使所有先前签发的令牌失效',
		'Reset all tokens': '重置所有令牌',
		'Reset issued tokens': '重置已签发令牌',
		'Generate new one': '生成新的',
		'Generate secret': '生成密钥',
		'Generate token': '生成令牌',
		'Token duration (in seconds)': '令牌有效期（秒）',
		'Duration (in seconds)': '时长（秒）',
		'Impersonate': '模拟登录',
		'Identity fields': '身份字段',
		'Identity/Password': '身份/密码',
		'Leave it empty to allow anyone with an account to authenticate.': '留空表示允许任何已有账户的用户登录。',
		'Verified': '已验证',

		// OAuth2 providers
		'Client ID': '客户端 ID',
		'Client secret': '客户端密钥',
		'Select OAuth2 provider': '选择 OAuth2 提供方',
		'Set provider config': '设置提供方配置',
		'Add provider': '添加提供方',
		'No providers found.': '未找到提供方。',
		'No external auth providers found.': '未找到外部认证提供方。',
		'OAuth2 avatar': 'OAuth2 头像',
		'OAuth2 full name': 'OAuth2 全名',
		'OAuth2 username': 'OAuth2 用户名',
		'Display name': '显示名称',
		'Generate Apple client secret': '生成 Apple 客户端密钥',
		'Successfully generated client secret.': '客户端密钥生成成功。',
		'Support PKCE': '支持 PKCE',
		'Provider endpoints': '提供方端点',
		'Self-hosted endpoints (optional)': '自托管端点（可选）',
		'User info URL': '用户信息 URL',
		'JWKS verification URL': 'JWKS 验证 URL',
		'URL to the public token verification keys.': '公共令牌验证密钥的 URL。',
		'Feishu (China)': '飞书（中国）',
		'Lark (International)': 'Lark（国际版）',

		// collections
		'New collection': '新建集合',
		'Collection settings': '集合设置',
		'Collections overview': '集合概览',
		'System collections': '系统集合',
		'Select collection from the sidebar.': '请从侧边栏选择集合。',
		'No collections found.': '未找到集合。',
		'Search collections...': '搜索集合...',
		'Select collection': '选择集合',
		'Load from JSON file': '从 JSON 文件加载',
		'Download JSON': '下载 JSON',
		'Download as JSON': '下载为 JSON',
		'Export as CSV': '导出为 CSV',
		'Merge with the existing collections': '与现有集合合并',
		'Replace with original IDs': '使用原始 ID 替换',
		'Confirm and import': '确认并导入',
		'Detected changes': '检测到的变更',
		'Side-by-side diff': '并排对比',
		'Your collections configuration is already up-to-date!': '集合配置已是最新！',
		'Paste below the collections configuration you want to import or': '在下方粘贴要导入的集合配置，或',
		'Failed to load the imported JSON.': '导入的 JSON 加载失败。',
		'Invalid collections configuration.': '集合配置无效。',
		'Invalid JSON': '无效的 JSON',
		'Invalid JSON data': '无效的 JSON 数据',
		'Do you really want to delete the selected collection?': '确定要删除所选集合吗？',
		'Successfully imported collections configuration.': '集合配置导入成功。',
		'Failed to save collection.': '集合保存失败。',
		'Collection copied to clipboard!': '集合已复制到剪贴板！',
		'Collection name': '集合名称',
		'All data associated with the removed fields will be permanently deleted!': '被移除字段的所有关联数据将被永久删除！',
		'Do you really want to save the collection changes?': '确定要保存集合更改吗？',
		'System collection rule cannot be changed.': '系统集合的规则不可修改。',
		'No collections with the selected rule.': '没有符合所选规则的集合。',
		'Additional auth collection rules': '附加的认证集合规则',
		'Fields and relations': '字段与关联',
		'Indexes': '索引',
		'API rules': 'API 规则',
		'API preview': 'API 预览',
		'Create index': '创建索引',
		'Update index': '更新索引',
		'Delete index': '删除索引',
		'Do you really want to remove the selected index from the collection?': '确定要从集合中移除所选索引吗？',
		'Wildcard columns (*) are not supported.': '不支持通配符列 (*)。',
		'Hide/Lock collection and record controls': '隐藏/锁定集合和记录控件',

		// fields
		'New field': '新建字段',
		'Field options': '字段选项',
		'Field name*': '字段名称*',
		'Help text': '帮助文本',
		'Required': '必填',
		'Hidden': '隐藏',
		'Unique': '唯一',
		'Presentable': '可展示',
		'Pattern': '模式',
		'Validation pattern': '校验模式',
		'Autogenerate pattern': '自动生成模式',
		'Set and autogenerate text matching the pattern on missing record create value.': '记录创建时若值缺失，则按模式自动生成文本。',
		'Only non-hidden fields with UNIQUE index constraint can be selected.': '仅可选择设置了 UNIQUE 索引的非隐藏字段。',
		'The field cannot be presentable if hidden.': '隐藏字段不能设为可展示。',
		'Hide from the JSON API response and filters.': '在 JSON API 响应和筛选中隐藏。',
		'Min': '最小值',
		'Max': '最大值',
		'Min select': '最少选择',
		'Max select': '最多选择',
		'Add choices*': '添加选项*',
		'Predefined colors': '预设颜色',
		'Thumb sizes': '缩略图尺寸',
		'Allowed mime types': '允许的 MIME 类型',
		'Allow files ONLY with the listed mime types.\nLeave empty for no restriction.': '仅允许上传列表中的 MIME 类型。\n留空表示不限制。',
		'Protected file': '受保护文件',
		'Cascade delete': '级联删除',
		'Min date (Local)': '最小日期（本地）',
		'Max date (Local)': '最大日期（本地）',
		'No decimals': '不允许小数',
		'Up to 71 chars': '最多 71 个字符',
		'Clear the field or set it to 0 for no limit.': '清空或设为 0 表示不限制。',
		'Clear the field or set it to 0 to fallback to the default (10).': '清空或设为 0 以回退到默认值 (10)。',
		'Clear the field or set it to 0 to fallback to the default limit (71).': '清空或设为 0 以回退到默认限制 (71)。',
		'Clear the field or set it to 0 to fallback to the default limit.': '清空或设为 0 以回退到默认限制。',
		'Existing decimal numbers will not be affected.': '已有的小数不会受影响。',
		'Make email public or private': '邮箱设为公开或私有',
		'Max allowed files reached': '已达到最大文件数限制',
		'Cannot preview the file.': '无法预览该文件。',
		'Upload or drop new file': '上传或拖放新文件',
		'Set map center and zoom first.': '请先设置地图中心和缩放级别。',
		'Select address coordinates': '选择地址坐标',
		'Search address...': '搜索地址...',
		'Archives (zip, 7zip, rar)': '压缩文件 (zip, 7zip, rar)',
		'Documents (pdf, doc/docx, xls/xlsx)': '文档 (pdf, doc/docx, xls/xlsx)',
		'Images (jpg, png, svg, gif, webp)': '图片 (jpg, png, svg, gif, webp)',
		'Videos (mp4, mpeg, avi, mov, 3gp)': '视频 (mp4, mpeg, avi, mov, 3gp)',
		'Choose presets': '选择预设',

		// field types
		'Number': '数字',
		'Bool': '布尔',
		'File': '文件',
		'Relation': '关联',
		'Select': '选项',
		'Geo Point': '地理坐标',
		'Rich editor': '富文本编辑器',
		'Plain text': '纯文本',
		'Original size': '原始尺寸',
		'100x100 thumb': '100x100 缩略图',
		'Single': '单个',
		'Multiple': '多个',
		'True': '是',
		'False': '否',
		'Autodate': '自动日期',
		'Create': '创建',
		'Update': '更新',
		'Create/Update': '创建/更新',

		// API rules / filters
		'List/Search rule': '列表/搜索规则',
		'View rule': '查看规则',
		'Delete rule': '删除规则',
		'Create rule': '创建规则',
		'Update rule': '更新规则',
		'Manage rule': '管理规则',
		'Authentication rule': '认证规则',
		'MFA rule': 'MFA 规则',
		'List/Search': '列表/搜索',
		'Leave empty to grant everyone access...': '留空表示允许所有人访问...',
		'Set superusers only': '仅限超级用户',
		'Superusers only': '仅限超级用户',
		'All': '所有人',
		'Guest only': '仅访客',
		'Auth only': '仅认证用户',
		'Unlock and set custom rule': '解锁并设置自定义规则',
		'Unlock to save': '解锁以保存',
		'Equal': '等于',
		'Not equal': '不等于',
		'Greater than': '大于',
		'Greater than or equal': '大于等于',
		'Less than': '小于',
		'Less than or equal': '小于等于',
		'Like/Contains': '模糊匹配/包含',
		'NOT Like/Contains': '不包含',
		'Search...': '搜索...',
		'Search term or filter...': '搜索关键字或筛选...',
		'Clear search': '清除搜索',
		'Search history': '搜索历史',
		'Your recent searches will show up here.': '你最近的搜索将显示在这里。',

		// records
		'Add new record': '新增记录',
		'Delete record': '删除记录',
		'Edit relation record': '编辑关联记录',
		'Open records picker': '打开记录选择器',
		'Do you really want to delete the selected record?': '确定要删除所选记录吗？',
		'Do you really want to delete the selected records?': '确定要删除所选记录吗？',
		'Do you really want to delete all records of the collection?': '确定要删除该集合的所有记录吗？',
		'Do you really want to reset all issued tokens for the selected auth record?': '确定要重置所选认证记录已签发的所有令牌吗？',
		'Failed to create record.': '记录创建失败。',
		'Failed to save record.': '记录保存失败。',
		'Failed to load record.': '记录加载失败。',
		'Record copied to clipboard!': '记录已复制到剪贴板！',
		'Missing required record id.': '缺少必需的记录 ID。',
		'The record has previous unsaved changes.': '记录存在未保存的更改。',
		'No records found.': '未找到记录。',
		'No selected records.': '未选择记录。',
		'Send verification email': '发送验证邮件',
		'Send password reset email': '发送密码重置邮件',
		'Successfully reset all tokens for the selected record.': '已成功重置所选记录的所有令牌。',

		// settings - application
		'App settings': '应用设置',
		'Application settings': '应用设置',
		'Application name': '应用名称',
		'Application URL': '应用 URL',
		'App logo': '应用标志',
		'Batch Web API': '批量 Web API',
		'Max requests': '最大请求数',
		'Max body size (in bytes)': '最大请求体（字节）',
		'Max processing time (in seconds)': '最长处理时间（秒）',
		'Rate limiting': '速率限制',
		'Rate limit label': '速率限制标签',
		'Add rate limit rule': '添加速率限制规则',
		'The rate limit rules are resolved in the following order (stops on the first match):': '速率限制规则按以下顺序匹配（命中即停止）：',
		'Learn more about the rate limit rules': '了解更多速率限制规则',
		'Superuser IPs': '超级用户 IP',
		'Superuser IPs and subnets': '超级用户 IP 和子网',
		'A comma separated list of superusers allowed IPs and subnets.': '逗号分隔的超级用户允许 IP 和子网列表。',
		'Superusers are always excluded and they can send as many requests as they want.': '超级用户始终不受限制，可任意发送请求。',
		'Use leftmost IP': '使用最左侧 IP',
		'Use rightmost IP': '使用最右侧 IP',
		'IP priority': 'IP 优先级',
		'IP proxy headers': 'IP 代理头',
		'Trusted IP proxy headers': '可信的 IP 代理头',
		'Excluded IPs and subnets': '排除的 IP 和子网',
		'Include requests by superusers': '包含超级用户的请求',
		'You can clear the headers field if PocketBase is not deployed behind a proxy.': '若 PocketBase 未部署在代理之后，可清空该字段。',

		// settings - mail
		'Configure common settings for sending emails.': '配置发送邮件的常用设置。',
		'Mail templates': '邮件模板',
		'Email template': '邮件模板',
		'Default Verification email template': '默认验证邮件模板',
		'Default Password reset email template': '默认密码重置邮件模板',
		'Default Confirm email change email template': '默认邮箱变更确认邮件模板',
		'Default OTP email template': '默认 OTP 邮件模板',
		'Default Login alert email template': '默认登录提醒邮件模板',
		'Sender address': '发件人地址',
		'Sender name': '发件人名称',
		'To email address': '收件邮箱地址',
		'SMTP server host': 'SMTP 服务器主机',
		'Use SMTP mail server': '使用 SMTP 邮件服务器',
		'TLS encryption': 'TLS 加密',
		'Auto (StartTLS)': '自动 (StartTLS)',
		'Always': '始终',
		'PLAIN (default)': 'PLAIN（默认）',
		'Send test email': '发送测试邮件',
		'Successfully sent test email.': '测试邮件发送成功。',
		'Test email send timeout.': '测试邮件发送超时。',
		'Verification': '验证',
		'Password reset': '密码重置',
		'Email change': '邮箱变更',
		'Login alert': '登录提醒',

		// settings - files storage
		'File storage': '文件存储',
		'Use S3 storage': '使用 S3 存储',
		'Store backups in S3 storage': '将备份存储到 S3',
		'Bucket': '存储桶',
		'Region': '区域',
		'Endpoint': '端点',
		'Access key': '访问密钥',
		'Secret key': '秘密密钥',
		'Force path-style addressing': '强制路径寻址',
		'S3 connected successfully': 'S3 连接成功',
		'Failed to establish S3 connection': 'S3 连接失败',
		'S3 test connection timeout.': 'S3 连接测试超时。',

		// settings - backups
		'Backup and restore your PocketBase data': '备份与恢复你的 PocketBase 数据',
		'Initialize new backup': '创建新备份',
		'Start backup': '开始备份',
		'Backup name': '备份名称',
		'Backup options': '备份选项',
		'No backups found.': '暂无备份。',
		'Restore backup': '恢复备份',
		'Upload backup': '上传备份',
		'Successfully generated new backup.': '新备份创建成功。',
		'Successfully uploaded a new backup.': '备份上传成功。',
		'The backup was started but may take a while to complete. You can come back later.': '备份已开始，可能需要一些时间完成，你可以稍后回来查看。',
		'Backup restore currently works only on UNIX based systems.': '备份恢复目前仅支持基于 UNIX 的系统。',
		'Please proceed with extreme caution and use it only with trusted backups!': '请务必谨慎操作，仅恢复可信的备份！',
		'Enable auto backups': '启用自动备份',
		'Max @auto backups to keep': '@auto 备份最大保留数',
		'Max days retention': '最大保留天数',
		'Cron expression': 'Cron 表达式',
		'Every day at 00:00h': '每天 00:00',
		'Every sunday at 00:00h': '每周日 00:00',
		'Every Mon and Wed at 00:00h': '每周一和周三 00:00',
		'Every first day of the month at 00:00h': '每月第一天 00:00',
		'Triggers app restart.': '触发应用重启。',

		// settings - crons
		'No registered crons found.': '暂无注册的定时任务。',
		'Registered app cron jobs': '已注册的应用定时任务',

		// logs
		'Log details': '日志详情',
		'No logs found.': '未找到日志。',
		'Delete all logs': '删除全部日志',
		'Do you really want to delete all logs?': '确定要删除全部日志吗？',
		'Successfully deleted all logs.': '全部日志删除成功。',
		'Log copied to clipboard!': '日志已复制到剪贴板！',
		'Min log level': '最小日志级别',
		'Logs settings': '日志设置',
		'Logs with level below the minimum will be ignored.': '低于最小级别的日志将被忽略。',
		'Enable IP logging': '记录 IP',
		'Enable Auth Id logging': '记录认证 ID',

		// SQL console
		'Invalid query': '无效的查询',
		'Invalid query.': '无效的查询。',
		'Valid query': '查询有效',
		'Query executed successfully!': '查询执行成功！',
		'Failed to execute query.': '查询执行失败。',
		'The returned rows are limited up to 1000.': '返回行数上限为 1000。',
		'No recently executed queries.': '暂无最近执行的查询。',
		'Recently executed queries': '最近执行的查询',
		'The executed queries have a max timeout of 3 minutes.': '查询最长超时时间为 3 分钟。',
		'Multiple queries are supported but only the result of the last one is returned.': '支持多条查询，但仅返回最后一条的结果。',
		'No rows found.': '没有查询结果。',

		// misc labels
		'Name': '名称',
		'Size': '大小',
		'Created': '创建时间',
		'Fields': '字段',
		'Rules': '规则',
		'Domain': '域名',
		'Type': '类型',
		'Values': '值',
		'Superuser login': '超级用户登录',
		'Manage superusers': '管理超级用户',
		'Detected proxy header.': '检测到代理头。',
		'It is recommend to list it as trusted.': '建议将其列为可信。',
		'The following record fields are available:': '以下记录字段可用：',
		'Hide available fields': '隐藏可用字段',
		'Show available fields': '显示可用字段',
	}

	// Dynamic strings with a variable tail: translated head + original tail.
	// Sorted by length (longest first) to avoid partial shadows.
	const prefixes = [
		['Successfully deleted record ', '已删除记录 '],
		['Successfully deleted collection ', '已删除集合 '],
		['Successfully created collection ', '已创建集合 '],
		['Successfully updated collection ', '已更新集合 '],
		['Successfully truncated collection ', '已清空集合 '],
		['Successfully imported collections ', '已导入集合 '],
		['Successfully triggered ', '已触发 '],
		['Successfully saved ', '已保存 '],
		['Successfully copied ', '已复制 '],
		['Changed API rule for ', '已更改 API 规则：'],
		['Changed OIDC ', '已更改 OIDC 配置：'],
		['Deleted field ', '已删除字段：'],
		['Renamed field ', '字段重命名：'],
		['Renamed collection ', '集合重命名：'],
		['Multiple to single value conversion of field ', '字段多值转单值：'],
		['Auto set on ', '自动设置时机：'],
		['Generate nonrenewable auth token for ', '为以下记录生成不可续期令牌：'],
		['Do you really want to remove provider ', '确定要移除提供方 '],
		['Do you really want to delete the selected collection and all its records', '确定要删除所选集合及其所有记录'],
		['Do you really want to manually change the verified account state from ', '确定要手动更改账户的验证状态：从 '],
		['The ONLY allowed superuser IPs will change to: ', '超级用户允许 IP 将变更为：'],
		['Type the collection name ', '输入集合名称 '],
		['Type the backup name ', '输入备份名称 '],
		['Type your new password for ', '为以下账户输入新密码：'],
		['Type your password to confirm changing your email address to ', '输入密码以确认将邮箱变更为 '],
		['Please check your ', '请检查邮箱 '],
		['Comma separated list of IPs and subnets such as: ', '逗号分隔的 IP 和子网列表，例如：'],
		['Affected rows: ', '受影响行数：'],
		['Detected proxy header:', '检测到代理头：'],
		['Total records: ', '记录总数：'],
		['Total: ', '总数：'],
		// the trailing space is rendered as a separate text node ("Total: " + "0"),
		// so the trimmed node text is "Total:"
		['Total:', '总数：'],
		['Use SMTP mail server', '使用 SMTP 邮件服务器'],
		['Public: ', '公开状态：'],
	].sort((a, b) => b[0].length - a[0].length)

	// Full-sentence dynamic patterns (regex replace).
	const patterns = [
		[/^Please check your (.+?) for the recovery link!$/, '请检查邮箱 $1，恢复链接已发送！'],
		[/^Create (.+?) record$/, '创建 $1 记录'],
	]

	// --------------------------------------------------------------------
	// Translation engine
	// --------------------------------------------------------------------
	const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, PRE: 1, CODE: 1 }
	const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-placeholder']

	function lookup(text) {
		let zh = Object.prototype.hasOwnProperty.call(dict, text) ? dict[text] : undefined
		if (zh === undefined) {
			for (let i = 0; i < prefixes.length; i++) {
				if (text.startsWith(prefixes[i][0])) {
					zh = prefixes[i][1] + text.slice(prefixes[i][0].length)
					break
				}
			}
		}
		if (zh === undefined) {
			for (let i = 0; i < patterns.length; i++) {
				if (patterns[i][0].test(text)) {
					zh = text.replace(patterns[i][0], patterns[i][1])
					break
				}
			}
		}
		return zh
	}

	function translateTextNode(node) {
		const parent = node.parentElement
		if (!parent || SKIP_TAGS[parent.tagName]) return
		const raw = node.nodeValue
		if (!raw || raw.length < 2) return
		const text = raw.trim()
		if (text.length < 2) return
		const zh = lookup(text)
		if (zh === undefined || zh === text) return
		const start = raw.indexOf(text)
		node.nodeValue = raw.slice(0, start) + zh + raw.slice(start + text.length)
	}

	function translateElement(el) {
		for (let i = 0; i < ATTRS.length; i++) {
			const raw = el.getAttribute(ATTRS[i])
			if (!raw || raw.length < 2) continue
			const text = raw.trim()
			if (text.length < 2) continue
			const zh = lookup(text)
			if (zh === undefined || zh === text) continue
			el.setAttribute(ATTRS[i], zh)
		}
	}

	function processNode(root) {
		if (root.nodeType === Node.TEXT_NODE) return translateTextNode(root)
		if (root.nodeType !== Node.ELEMENT_NODE) return
		const pendingNodes = [root]
		while (pendingNodes.length) {
			const el = pendingNodes.pop()
			if (SKIP_TAGS[el.tagName]) continue
			translateElement(el)
			for (let child = el.firstChild; child; child = child.nextSibling) {
				if (child.nodeType === Node.TEXT_NODE) translateTextNode(child)
				else if (child.nodeType === Node.ELEMENT_NODE) pendingNodes.push(child)
			}
		}
	}

	// --------------------------------------------------------------------
	// Language toggle button
	// --------------------------------------------------------------------
	function ensureToggleButton() {
		if (document.getElementById('pb-admin-lang-toggle')) return
		const btn = document.createElement('button')
		btn.id = 'pb-admin-lang-toggle'
		btn.type = 'button'
		btn.textContent = lang === 'zh' ? 'EN' : '中'
		btn.title = '切换管理界面语言 / Toggle admin UI language'
		btn.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:10000;' +
			'opacity:.35;font-size:12px;line-height:1;padding:4px 10px;border-radius:999px;' +
			'border:1px solid rgba(128,128,128,.45);background:rgba(127,127,127,.12);' +
			'color:inherit;cursor:pointer;transition:opacity .15s'
		btn.addEventListener('mouseenter', () => (btn.style.opacity = '1'))
		btn.addEventListener('mouseleave', () => (btn.style.opacity = '.35'))
		btn.addEventListener('click', () => {
			try {
				localStorage.setItem(LANG_KEY, lang === 'zh' ? 'en' : 'zh')
			} catch (e) { /* ignore */ }
			window.location.reload()
		})
		document.body.appendChild(btn)
	}

	// --------------------------------------------------------------------
	// MutationObserver wiring
	// --------------------------------------------------------------------
	const pendingNodes = new Set()
	// MessageChannel-based macrotask scheduling: unlike requestAnimationFrame
	// it still fires when the tab is in the background.
	const channel = new MessageChannel()
	let scheduled = false
	channel.port1.onmessage = () => {
		scheduled = false
		flush()
	}

	function schedule(node) {
		if (node) pendingNodes.add(node)
		if (!scheduled) {
			scheduled = true
			channel.port2.postMessage(null)
		}
	}

	function flush() {
		ensureToggleButton()
		if (!enabled) {
			pendingNodes.clear()
			return
		}
		const batch = Array.from(pendingNodes)
		pendingNodes.clear()
		for (let i = 0; i < batch.length; i++) {
			// skip nodes detached before processing
			if (batch[i].isConnected) {
				try {
					processNode(batch[i])
				} catch (e) { /* keep processing the rest of the batch */ }
			}
		}
	}

	function start() {
		ensureToggleButton()
		const observer = new MutationObserver((mutations) => {
			for (let i = 0; i < mutations.length; i++) {
				const m = mutations[i]
				if (m.type === 'childList') {
					for (let j = 0; j < m.addedNodes.length; j++) schedule(m.addedNodes[j])
					// nodes were only removed (e.g. rerender swap): recheck the parent
					if (!m.addedNodes.length && m.removedNodes.length) schedule(m.target)
				} else {
					schedule(m.target)
				}
			}
		})
		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
			attributeFilter: ATTRS,
		})
		if (document.body) processNode(document.body)
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start)
	} else {
		start()
	}
})()
