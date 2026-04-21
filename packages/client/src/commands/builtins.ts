import { commandRegistry, CommandError } from './registry';
import type { CommandContext } from './registry';

commandRegistry.register({
  name: 'help',
  description: '显示所有可用命令',
  usage: '/help',
  paramType: 'none',
  execute: async ({ channelId, dispatch }: CommandContext) => {
    const lines = commandRegistry.all().map(c => `\`${c.usage}\` — ${c.description}`);
    dispatch({
      type: 'INSERT_LOCAL_SYSTEM_MESSAGE',
      payload: { channelId, text: lines.join('\n') },
    });
  },
});

commandRegistry.register({
  name: 'leave',
  description: '离开当前频道',
  usage: '/leave',
  paramType: 'none',
  execute: async ({ channelId, api, dispatch }: CommandContext) => {
    const confirmed = window.confirm('确定离开当前频道？');
    if (!confirmed) return;
    await api.leaveChannel(channelId);
    dispatch({ type: 'NAVIGATE_AFTER_LEAVE', payload: { channelId } });
  },
});

commandRegistry.register({
  name: 'topic',
  description: '设置频道主题',
  usage: '/topic <text>',
  paramType: 'text',
  placeholder: '输入频道主题…',
  execute: async ({ channelId, args, api }: CommandContext) => {
    if (!args.trim()) throw new CommandError('Usage: /topic <text>');
    await api.updateChannel(channelId, { topic: args.trim() });
  },
});

commandRegistry.register({
  name: 'invite',
  description: '邀请用户加入频道',
  usage: '/invite @user',
  paramType: 'user',
  placeholder: '选择用户…',
  execute: async ({ channelId, resolvedUser, api }: CommandContext) => {
    if (!resolvedUser) throw new CommandError('Usage: /invite @user');
    await api.addChannelMember(channelId, resolvedUser.id);
  },
});

commandRegistry.register({
  name: 'dm',
  description: '打开与用户的私信',
  usage: '/dm @user',
  paramType: 'user',
  placeholder: '选择用户…',
  execute: async ({ resolvedUser, actions }: CommandContext) => {
    if (!resolvedUser) throw new CommandError('Usage: /dm @user');
    await actions.openDm(resolvedUser.id);
  },
});
