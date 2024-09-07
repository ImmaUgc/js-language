const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const fn_entries = [
    'printf'
];

class Token {
    constructor(value, type) {
        this.value = value;
        this.type = type;
    }
}

class Lexer {
    constructor(content) {
        this.content = content
        .trim()
        .split('\n');
        this.tokens = [];
        this.current_line = -1;
        this.current_char_index = 0;
        this.past_character = '';
        this.current_char = '';
        this.next_character = '';
        this.current_token = new Token('', 'UNKNOWN');
        this.next_line();
        this.run();
    }

    next_line() {
        this.current_line++;
        if(this.current_line >= this.content.length) {
            this.current_char = null;
            return;
        }
        this.current_char_index = -1;
        this.next_char(); 
    }

    next_char() {
        this.current_char_index++;
        if(this.current_char_index >= ((this.content[this.current_line] && this.content[this.current_line].length) || 0)) {
            this.next_line();
            return;
        }
        this.past_character = this.current_char_index > 0 ? this.content[this.current_line][this.current_char_index - 1] : '';
        this.next_character = this.current_char_index < this.content[this.current_line].length - 1 ? this.content[this.current_line][this.current_char_index + 1] : '';
        this.current_char = this.content[this.current_line][this.current_char_index];
    }

    is_space(char) {
        return /\s/.test(char);
    }

    is_number(char) {
        return /[0-9]/.test(char);
    }

    is_alphanumeric(char) {
        return /[a-zA-Z0-9]/.test(char);
    }

    is_letter(char) {
        return /[a-zA-Z]/.test(char);
    }

    error(message) {
        console.error(`\nLine: ${this.current_line}\nPosition: ${this.current_char_index}\n${message}`);
        process.exit();
    }

    run() {
        while(this.current_char) {
            while(this.is_space(this.current_char)) this.next_char();

            // Number (int float)
            if(this.is_number(this.current_char) || this.current_char == '.') {
                this.current_token.type = 'INTEGER';
                let has_dot = false;
                while(this.is_number(this.current_char) || this.current_char == '.') {
                    if(has_dot && this.current_char == '.') {
                        this.error('Invalid float');
                    }
                    if(this.current_char == '.') {
                        this.current_token.type = 'FLOAT';
                        has_dot = true;
                    }
                    this.current_token.value += this.current_char;
                    this.next_char();
                }
            }

            // String

            else if(this.current_char == '"') {
                this.current_token.type = 'STRING';
                this.next_char();
                while(this.current_char != '"' && this.current_char != null) {
                    this.current_token.value += this.current_char;
                    this.next_char();
                }
                if(this.current_char == null) {
                    this.error('\'"\' expected at the end of the string');
                }
                this.next_char();
            }
            // Native
            else if(this.current_char == '`') {
                this.current_token.type = 'NATIVE';
                this.next_char();
                while(this.current_char != '`' && this.current_char != null) {
                    this.current_token.value += this.current_char;
                    this.next_char();
                }
                if(this.current_char == null) {
                    this.error('\'`\' expected at the end of the native code');
                }
                this.next_char();
            }

            // Identifier
            else if(this.is_letter(this.current_char)) {
                this.current_token.type = 'IDENTIFIER';
                while(this.is_alphanumeric(this.current_char) && this.current_char != null) {
                    this.current_token.value += this.current_char;
                    this.next_char();
                }
                switch(this.current_token.value) {
                    case 'var':
                    case 'const':
                        this.current_token.type = 'KEYWORD';
                        break;
                }
                if(fn_entries.includes(this.current_token.value)) {
                    this.current_token.type = 'FUNCTION';
                }
            } else {
                this.current_token.value = this.current_char;
                switch(this.current_char) {
                    case '=':
                        this.current_token.type = 'ASSIGNMENT';
                        this.next_char();
                        break;
                    case ';':
                        this.current_token.type = 'EOL';
                        this.next_char();
                        break;
                }
            }

            if(this.current_token.type == 'UNKNOWN') break;
            this.tokens.push(this.current_token);
            this.current_token = new Token('', 'UNKNOWN');
            if(this.current_char == null) break;
        }
    }
}

class Parser {
    constructor(tokens) {
        this.content = 'int main(int argc, char** argv) {\n//main\n\treturn 0;\n}';
        this.add_tls('include', '"entries.h"');
        this.tokens = tokens;
        this.current_token_index = -1;
        this.current_token;
        this.next_token();
        this.run();
    }

    add_tls(statement, content) {
        this.content = `#${statement} ${content}\n${this.content}`;
    }

    add_tofunction(name, code) {
        this.content = this.content.replace(`//${name}`, `\t${code}\n\t//${name}`);
    }

    get_c_type(type) {
        let c_type = '';
        switch(type) {
            case 'STRING':
                c_type = 'char*';
                break;
            case 'INTEGER':
                c_type = 'int';
                break;
            case 'FLOAT':
                c_type = 'float';
                break;
            default:
                c_type = 'void*';
        }
        return c_type;
    }

    add_variable(name, type, value) {
        let c_type = this.get_c_type(type);
        let c_value = value;
        if(type == 'STRING') c_value = `"${value}"`;
        this.add_tofunction('main', `${c_type} ${name} = ${c_value};`);
    }

    error(message) {
        console.error(`\nToken: ${this.current_token.value}\n${message}`);
        process.exit();
    }

    next_token(type) {
        this.current_token_index++;
        if(this.current_token_index >= this.tokens.length) {
            this.current_token = null;
            return;
        }
        this.current_token = this.tokens[this.current_token_index];
        if(this.current_token.type != type && type) {
            this.error(`Parser was expecting "${type}" but got "${this.current_token.type}"`);
        }
    }

    run() {
        while(this.current_token) {
            if(this.current_token.type == 'KEYWORD') {
                if(this.current_token.value == 'var') {
                    this.next_token('IDENTIFIER');
                    const name = this.current_token.value;
                    this.next_token('ASSIGNMENT');
                    this.next_token();
                    const type = this.current_token.type;
                    const value = this.current_token.value;
                    this.next_token();
                    this.add_variable(name, type, value);
                }
            } else if(this.current_token.type == 'FUNCTION') {
                const name = this.current_token.value;
                let args = [];
                this.next_token();
                while(this.current_token.type != 'EOL') {
                    let c_value = this.current_token.value;
                    if(this.current_token.type == 'STRING') c_value = `"${c_value}"`;
                    args.push(c_value);
                    this.next_token();
                }
                this.next_token();
                this.add_tofunction('main', `${name}(${args.join(', ')});`);
            } else if(this.current_token.type == 'NATIVE') {
                this.add_tofunction('main', this.current_token.value);
                this.next_token();
            } else {
                this.error(`Token inválido.`);
            }
        }
        this.compile();
    }

    ident() {
        const lines = this.content.split('\n');
        let indentLevel = 0;
        const indentSize = 1;
        const indentChar = '\t';
        this.content = lines.map(line => {
            line = line.trim();
            if (line.startsWith('}')) {
                indentLevel--;
            }
            const indentedLine = indentChar.repeat(indentLevel * indentSize) + line;
            if (line.endsWith('{')) {
                indentLevel++;
            }
            return indentedLine;
        }).join('\n');
        console.log(this.content)
    }

    compile() {
        this.ident();
        fs.writeFileSync('output.c', this.content, 'utf-8');
        let exe = path.join(process.cwd(), 'output.exe');
        child_process.execSync(`gcc output.c entries.c -o ${exe}`);
        console.log(`Executable path ${exe}`);
    }
}

const lex = new Lexer(fs.readFileSync(path.join(process.cwd(), process.argv[2]), 'utf-8'));
new Parser(lex.tokens);