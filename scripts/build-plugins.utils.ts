import ts from 'typescript'

export function relativeSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const file = ts.createSourceFile('runtime.js', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  ts.forEachChild(file, visit)
  return specifiers

  function visit(node: ts.Node): void {
    let target: ts.Node | undefined
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      target = node.moduleSpecifier
    }
    else if (ts.isCallExpression(node) && (
      node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require')
    )) {
      target = node.arguments[0]
    }
    if (target && ts.isStringLiteralLike(target) && target.text.startsWith('.')) {
      specifiers.push(target.text)
    }
    ts.forEachChild(node, visit)
  }
}
