#!/bin/bash

# Memory Search 验证脚本
# 检查 Memory Search 在正确的应用数据目录中的状态

echo "🔍 Memory Search 验证工具"
echo "========================="
echo ""

# 正确的应用数据目录
APP_DATA_DIR="$HOME/.catbot/workspace"

echo "📍 应用数据位置: $APP_DATA_DIR"
echo ""

# 检查应用数据目录
echo "📁 检查应用数据目录..."
if [ -d "$APP_DATA_DIR" ]; then
    echo "✅ 应用数据目录存在"

    # 列出目录内容
    echo ""
    echo "目录内容:"
    ls -lh "$APP_DATA_DIR" | tail -n +2 | awk '{print "   ", $9, "("$5")"}'
else
    echo "❌ 应用数据目录不存在"
    echo "   (首次运行应用后会自动创建)"
    exit 1
fi

# 检查 memory 目录
echo ""
echo "🗄️  检查 memory 目录..."
if [ -d "$APP_DATA_DIR/memory" ]; then
    echo "✅ memory/ 目录存在"

    # 统计文件
    md_count=$(find "$APP_DATA_DIR/memory" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
    txt_count=$(find "$APP_DATA_DIR/memory" -name "*.txt" 2>/dev/null | wc -l | tr -d ' ')
    echo "   - .md 文件: ${md_count}"
    echo "   - .txt 文件: ${txt_count}"

    # 列出 memory 目录内容
    if [ "$(ls -A "$APP_DATA_DIR/memory" 2>/dev/null)" ]; then
        echo "   - 内容:"
        ls -lh "$APP_DATA_DIR/memory" | tail -n +2 | awk '{print "     ", $9, "("$5")"}'
    fi
else
    echo "⚠️  memory/ 目录不存在"
    echo "   (首次发送消息后会自动创建)"
fi

# 检查 SQLite 数据库
echo ""
echo "💾 检查数据库文件..."
sqlite_files=$(find "$APP_DATA_DIR" -name "*.sqlite" 2>/dev/null)
if [ -z "$sqlite_files" ]; then
    echo "❌ 没有找到 .sqlite 文件"
    echo ""
    echo "💡 数据库文件尚未生成，原因："
    echo "   - 应用还没有运行，或"
    echo "   - 还没有发送过消息"
    echo ""
    echo "📋 下一步:"
    echo "   1. 运行: pnpm dev"
    echo "   2. 发送一条消息(如: '你好')"
    echo "   3. 再次运行验证: ./check-memory.sh"
else
    echo "✅ 找到数据库文件:"
    for file in $sqlite_files; do
        size=$(ls -lh "$file" | awk '{print $5}')
        basename=$(basename "$file")
        echo "   - $basename ($size)"

        # 检查 sqlite3 命令
        if command -v sqlite3 &> /dev/null; then
            # 查看表
            tables=$(sqlite3 "$file" ".tables" 2>/dev/null)
            echo "     表: $tables"

            # 查看 chunks 数量
            chunk_count=$(sqlite3 "$file" "SELECT COUNT(*) FROM chunks;" 2>/dev/null)
            echo "     已索引: $chunk_count 个 chunks"

            # 查看数据源
            sources=$(sqlite3 "$file" "SELECT DISTINCT source_type FROM chunks;" 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
            if [ -n "$sources" ]; then
                echo "     数据源: $sources"
            fi
        fi
    done
fi

# 检查 sessions 目录
echo ""
echo "💬 检查会话历史..."
if [ -d "$APP_DATA_DIR/sessions" ]; then
    echo "✅ sessions/ 目录存在"
    session_count=$(find "$APP_DATA_DIR/sessions" -name "*.jsonl" 2>/dev/null | wc -l | tr -d ' ')
    echo "   - 会话数量: $session_count"

    if [ $session_count -gt 0 ]; then
        for session in "$APP_DATA_DIR/sessions"/*.jsonl; do
            msg_count=$(wc -l < "$session" 2>/dev/null | tr -d ' ')
            basename=$(basename "$session")
            echo "   - $basename: $msg_count 条消息"
        done
    fi
else
    echo "⚠️  sessions/ 目录不存在"
    echo "   (首次发送消息后会自动创建)"
fi

# 检查配置文件
echo ""
echo "⚙️  检查配置..."
if [ -f "$APP_DATA_DIR/catbot.json" ]; then
    echo "✅ catbot.json 存在"

    # 检查 API Key (隐藏实际值)
    if grep -q '"apiKey"' "$APP_DATA_DIR/catbot.json" 2>/dev/null; then
        api_key=$(grep '"apiKey"' "$APP_DATA_DIR/catbot.json" | sed 's/.*"apiKey": *"\([^"]*\)".*/\1/')
        if [ -n "$api_key" ] && [ "$api_key" != "" ]; then
            masked_key="${api_key:0:7}...${api_key: -4}"
            echo "   - API Key: $masked_key"
        else
            echo "   - API Key: (未配置)"
        fi
    fi
else
    echo "⚠️  catbot.json 不存在"
    echo "   (首次运行应用后会自动创建)"
fi

# 总结
echo ""
echo "========================="
echo "📊 验证总结"
echo "========================="

if [ -n "$sqlite_files" ] && [ -d "$APP_DATA_DIR/sessions" ]; then
    echo "✅ Memory Search 正常工作!"
    echo ""
    echo "📍 数据存储位置: $APP_DATA_DIR"
    echo "   - memory/    : 记忆数据库和知识库文件"
    echo "   - sessions/  : 对话历史"
    echo "   - IDENTITY.md: 身份提示词"
    echo "   - AGENTS.md  : Agent 配置"
elif [ ! -d "$APP_DATA_DIR/sessions" ]; then
    echo "⚠️  应用可能还没有运行过"
    echo ""
    echo "📋 请执行以下步骤:"
    echo "   1. 运行: pnpm dev"
    echo "   2. 发送一条消息(如: '你好')"
    echo "   3. 再次运行验证: ./check-memory.sh"
else
    echo "⚠️  Memory Search 尚未初始化"
    echo ""
    echo "📋 可能的原因:"
    echo "   - 还没有发送过消息"
    echo "   - Memory Search 初始化失败(查看日志)"
fi

echo ""
