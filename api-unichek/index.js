const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
const dbConfig = {
    user: 'sa', 
    password: 'Allan@2612', 
    server: 'localhost', 
    database: 'Unichek', 
    options: { encrypt: true, trustServerCertificate: true }
};

// --- ROTAS DE TURMAS ---
// ROTA PARA LISTAR TURMAS (O App usa esta para carregar a lista)
app.get('/admin/turmas', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query("SELECT id, nome_turma, periodo FROM Turmas");
        
        // Garante que estamos enviando JSON
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, lista: result.recordset });
    } catch (err) {
        console.error("Erro na rota de turmas:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ROTA PARA CRIAR TURMA (O App usa esta no botão CRIAR)
app.post('/admin/turmas', async (req, res) => {
    const { nome_turma, periodo } = req.body;
    console.log("Tentando criar turma:", nome_turma, periodo); // ADICIONE ISSO
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('nome', sql.VarChar, nome_turma)
            .input('periodo', sql.VarChar, periodo)
            .query("INSERT INTO Turmas (nome_turma, periodo) VALUES (@nome, @periodo)");
        res.json({ success: true });
    } catch (err) { 
        console.error("ERRO NO SQL:", err.message); // ADICIONE ISSO
        res.status(500).json({ success: false, message: err.message }); 
    }
});
// --- CADASTRO DE USUÁRIOS (COM VÍNCULO) ---
app.post('/admin/cadastrar', async (req, res) => {
    const { nome, ra, senha, tipo, id_turma, turmas_professor } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        let transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const request = new sql.Request(transaction);
            let result = await request
                .input('nome', sql.VarChar, nome)
                .input('ra', sql.VarChar, ra)
                .input('senha', sql.VarChar, senha)
                .input('tipo', sql.VarChar, tipo)
                .input('id_turma', sql.Int, tipo === 'aluno' ? id_turma : null)
                .query("INSERT INTO Usuarios (nome, ra, senha, tipo, id_turma) OUTPUT INSERTED.id VALUES (@nome, @ra, @senha, @tipo, @id_turma)");
            
            const userId = result.recordset[0].id;

            if (tipo === 'professor' && turmas_professor) {
                for (let turmaId of turmas_professor) {
                    await new sql.Request(transaction)
                        .input('u', sql.Int, userId)
                        .input('t', sql.Int, turmaId)
                        .query("INSERT INTO Professor_Turmas (id_usuario, id_turma) VALUES (@u, @t)");
                }
            }
            await transaction.commit();
            res.json({ success: true });
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// LISTAGEM DE USUÁRIOS
// LISTAGEM DE USUÁRIOS
app.get('/admin/usuarios', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT u.id, u.nome, u.ra, u.senha, u.tipo, t.nome_turma, u.id_turma 
            FROM Usuarios u 
            LEFT JOIN Turmas t ON u.id_turma = t.id
        `); // Adicionei u.senha e u.id_turma aqui
        res.json({ success: true, lista: result.recordset });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/admin/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, ra, senha, tipo, id_turma } = req.body;
    
    try {
        let pool = await sql.connect(dbConfig);
        let request = pool.request();
        
        // Parâmetros que sempre vão existir
        request.input('id', sql.Int, id);
        request.input('nome', sql.VarChar, nome);
        request.input('ra', sql.VarChar, ra);
        request.input('tipo', sql.VarChar, tipo);
        request.input('id_turma', sql.Int, tipo === 'aluno' ? id_turma : null);

        let query;
        // Se a senha foi preenchida no App, atualiza ela também
        if (senha && senha.trim() !== "") {
            request.input('senha', sql.VarChar, senha);
            query = `UPDATE Usuarios SET nome=@nome, ra=@ra, senha=@senha, tipo=@tipo, id_turma=@id_turma WHERE id=@id`;
        } else {
            // Se a senha veio vazia, a query NÃO mexe na coluna senha
            query = `UPDATE Usuarios SET nome=@nome, ra=@ra, tipo=@tipo, id_turma=@id_turma WHERE id=@id`;
        }

        await request.query(query);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Rota de teste para o App verificar se o IP está ativo
app.get('/teste', (req, res) => {
    console.log("📡 App verificando conexão...");
    res.json({ success: true, message: "Servidor Online" });
});

app.post('/login', async (req, res) => {
    const { ra, senha, tipo } = req.body;
    console.log(`🔑 Tentativa de login: RA ${ra} como ${tipo}`);

    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('ra', sql.VarChar, ra)
            .input('senha', sql.VarChar, senha)
            .input('tipo', sql.VarChar, tipo)
            .query("SELECT id, nome, ra, tipo FROM Usuarios WHERE ra = @ra AND senha = @senha AND tipo = @tipo");

        if (result.recordset.length > 0) {
            console.log("✅ Login bem-sucedido!");
            res.json({ success: true, user: result.recordset[0] });
        } else {
            console.log("❌ Credenciais inválidas.");
            res.json({ success: false, message: "RA ou Senha incorretos para este perfil." });
        }
    } catch (err) {
        console.error("ERRO NO LOGIN:", err.message);
        res.status(500).json({ success: false, message: "Erro interno no servidor." });
    }
});

app.put('/admin/turmas/:id', async (req, res) => {
    const { id } = req.params;
    const { nome_turma, periodo } = req.body;
    
    console.log(`📝 Editando turma ID ${id}:`, nome_turma, periodo);

    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.VarChar, nome_turma)
            .input('periodo', sql.VarChar, periodo)
            .query("UPDATE Turmas SET nome_turma = @nome, periodo = @periodo WHERE id = @id");
        
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Erro ao atualizar turma:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ROTA PARA DELETAR TURMA
// 2. ROTA PARA DELETAR TURMA
app.delete('/admin/turmas/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`🗑️ Automatizando exclusão da turma ID: ${id}`);
    
    try {
        let pool = await sql.connect(dbConfig);

        // 1. Busca o ID da turma "Sem Turma"
        let buscaSemTurma = await pool.request()
            .query("SELECT id FROM Turmas WHERE nome_turma = 'Sem Turma'");
        
        let idSemTurma = buscaSemTurma.recordset.length > 0 ? buscaSemTurma.recordset[0].id : null;

        // 2. Se a turma que você está apagando for a própria "Sem Turma", não deixa apagar
        if (id == idSemTurma) {
            return res.status(400).json({ success: false, message: "A turma 'Sem Turma' é protegida e não pode ser apagada." });
        }

        // 3. Move os alunos para a turma "Sem Turma" (ou deixa NULL se ela não existir)
        await pool.request()
            .input('idAntigo', sql.Int, id)
            .input('idNovo', sql.Int, idSemTurma)
            .query("UPDATE Usuarios SET id_turma = @idNovo WHERE id_turma = @idAntigo");

        // 4. Remove vínculos de professores
        await pool.request()
            .input('id', sql.Int, id)
            .query("DELETE FROM Professor_Turmas WHERE id_turma = @id");

        // 5. Apaga a turma antiga
        await pool.request()
            .input('id', sql.Int, id)
            .query("DELETE FROM Turmas WHERE id = @id");

        res.json({ success: true });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, message: "Erro no servidor ao processar exclusão." });
    }
});

// 3. ROTA PARA DELETAR USUÁRIO
app.delete('/admin/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`🗑️ Tentando deletar usuário ID: ${id}`);
    try {
        let pool = await sql.connect(dbConfig);
        // Limpa vínculos de professor primeiro
        await pool.request().input('id', sql.Int, id).query("DELETE FROM Professor_Turmas WHERE id_usuario = @id");
        // Deleta o usuário
        await pool.request().input('id', sql.Int, id).query("DELETE FROM Usuarios WHERE id = @id");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
const PORT = 3000;
// Usar '0.0.0.0' obriga o servidor a ouvir todos os IPs da rede
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor UniCheck ativo na porta ${PORT}`);
});