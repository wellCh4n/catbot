# Memory Search 错误修复

## 问题
遇到 Anthropic API 错误：
```
invalid params, tool call result does not follow tool call (2013)
```

## 原因
消息序列格式不正确：
1. Tool use 和 tool result 没有正确配对
2. 可能存在孤立的 tool result 消息
3. 消息角色顺序混乱

## 修复内容

### 1. 改进消息转换逻辑 (executeLoop)
- ✅ 主动查找并配对 tool use 和 tool result
- ✅ 跳过独立的 tool result 消息
- ✅ 如果找不到 tool result，自动添加错误结果
- ✅ 空 content 时不添加 text block

### 2. 添加消息序列验证 (validateMessageSequence)
- ✅ 检查消息角色是否正确交替
- ✅ 验证 tool use 后必须跟 tool result
- ✅ 第一条消息必须是 user
- ✅ 详细的错误日志

### 3. 改进日志输出
- ✅ 显示转换前后的消息数量
- ✅ 可通过环境变量 `DEBUG_MESSAGES=1` 查看详细消息

## 测试步骤

### 1. 清空旧会话历史（避免旧数据导致问题）
在应用中点击右上角垃圾桶图标清空会话

### 2. 重启应用
```bash
pnpm dev
```

### 3. 测试基础对话
输入简单消息：
```
你好
```

### 4. 测试工具调用
输入需要工具的消息：
```
读取 package.json 文件
```

### 5. 测试记忆搜索
先创建测试记忆：
```bash
mkdir -p workspace/memory
echo "# 测试记忆\n这是一个测试文件" > workspace/memory/test.md
```

然后提问：
```
记忆中有什么内容？
```

## 预期日志输出

正常情况下应该看到：
```
[agentLoop] Converted 2 chat messages to 2 API messages
[agentLoop] Message sequence validation passed
[agentLoop] step=1/50 messages=2
```

如果有警告：
```
[agentLoop] No tool result found for tool use xxx, adding error result
```

说明会话历史中有不完整的工具调用，已自动修复。

## 如果仍有问题

1. **清空会话历史**
   ```bash
   rm workspace/sessions/*.jsonl
   ```

2. **禁用 Memory Search 测试**
   注释掉 AgentManager 中的 memory search 初始化代码

3. **查看详细消息**
   ```bash
   DEBUG_MESSAGES=1 pnpm dev
   ```

4. **检查 session 文件格式**
   ```bash
   cat workspace/sessions/main.jsonl
   ```

确保每个 tool use 都有对应的 tool result。
