export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Forbid // line comments. Code should be self-explanatory; use intention-revealing names instead.',
      recommended: true,
    },
  },
  create(context) {
    return {
      Program() {
        const sourceCode = context.sourceCode || context.getSourceCode()
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type === 'Line') {
            context.report({
              loc: comment.loc,
              message: 'Line comments (//) are not allowed. Make code self-explanatory with clear naming.',
            })
          }
        }
      },
    }
  },
}
