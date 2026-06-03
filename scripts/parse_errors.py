import sys
import re

def translate_error(text):
    translations = [
        (r"OutOfMemoryError|GC overhead limit exceeded", "Erro de memória esgotada (OOM) ao compilar. O processo do Gradle excedeu o limite de memória RAM disponível do container."),
        (r"Cannot find Symbol|symbol not found", "Erro no código Java: Símbolo ou classe não encontrada. Verifique se importou todas as dependências."),
        (r"expected ';'", "Erro de sintaxe no código: Faltando ponto e vírgula ';' no final da linha."),
        (r"unresolved external symbol", "Erro no código nativo C/C++: Símbolo externo não resolvido. Verifique se as funções declaradas no arquivo header (.h) estão implementadas no arquivo de código (.cpp)."),
        (r"fatal error:\s*([^:\n]+)\s*file not found", r"Erro crítico de C/C++: Arquivo de cabeçalho '\1' não foi encontrado. Verifique os caminhos dos includes no CMakeLists/Android.mk."),
        (r"Cannot resolve configuration|Could not resolve all dependencies", "Erro de dependências: Não foi possível resolver todas as dependências do build.gradle. Verifique sua conexão ou repositórios."),
        (r"Permission denied", "Erro de permissão: Falha ao executar arquivos ou scripts. Verifique se o gradlew tem permissão de execução."),
        (r"SDK|[vV]ersion mismatch|compileSdkVersion", "Incompatibilidade de SDK: Há um conflito nas configurações de versão de SDK ou Build Tools configurados no projeto."),
    ]
    explanations = []
    for pattern, desc in translations:
        if re.search(pattern, text, re.IGNORECASE):
            explanations.append(f"💡 **Causa Provável:** {desc}")
    return "\n".join(explanations)

def main():
    try:
        with open('build.log', 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
    except Exception as e:
        print("Não foi possível ler o arquivo de build.log.")
        with open('error_details.txt', 'w', encoding='utf-8') as f:
            f.write("Não foi possível ler o log de build do Gradle.")
        return

    errors = []
    for i, line in enumerate(lines):
        if re.search(r'(:\s*error:|fatal error:|Compilation failed|e:\s*/.*:\s*\(\d+,\s*\d+\):)', line, re.IGNORECASE):
            start = max(0, i - 1)
            end = min(len(lines), i + 4)
            errors.append("".join(lines[start:end]))
            if len(errors) >= 2: # Pega no máximo os 2 primeiros blocos de erro
                break

    if not errors:
        for i, line in enumerate(lines):
            if '* What went wrong:' in line:
                start = i
                end = min(len(lines), i + 8)
                errors.append("".join(lines[start:end]))
                break

    error_text = ""
    if errors:
        raw_errors = "\n\n".join(errors)
        explanation = translate_error(raw_errors)
        # Limita o log cru para caber perfeitamente no limite de mensagem do Discord
        if len(raw_errors) > 800:
            raw_errors = raw_errors[:770] + "\n...[Cortado por tamanho]"
        error_text = f"\\n\\n**Detalhes Técnicos do Erro (Log):**\\n```\\n{raw_errors}\\n```"
        if explanation:
            error_text += f"\\n{explanation}"
    else:
        error_text = "\\n\\n**Detalhes Técnicos do Erro:**\\nNão foi possível extrair a causa específica automaticamente do log."

    # Grava os detalhes em um arquivo de texto
    with open('error_details.txt', 'w', encoding='utf-8') as f:
        f.write(error_text)

if __name__ == '__main__':
    main()
