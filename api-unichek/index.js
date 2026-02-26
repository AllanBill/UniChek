const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type'] }));

const dbConfig = {
    user: 'sa', 
    password: 'Allan@2612', 
    server: 'localhost', 
    database: 'Unichek', 
    options: { encrypt: true, trustServerCertificate: true }
};

// --- ROTAS DE TURMAS ---

app.get('/admin/turmas', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query("SELECT id, nome_turma, periodo FROM Turmas");
        res.json({ success: true, lista: result.recordset });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/admin/turmas', async (req, res) => {
    const { nome_turma, periodo, semestres } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        const total = parseInt(semestres) || 1;
        for (let i = 1; i <= total; i++) {
            const nomeFinal = total > 1 ? `${nome_turma} - ${i}° Período` : nome_turma;
            await pool.request()
                .input('nome', sql.VarChar, nomeFinal)
                .input('periodo', sql.VarChar, periodo)
                .query("INSERT INTO Turmas (nome_turma, periodo) VALUES (@nome, @periodo)");
        }
        res.json({ success: true, message: "Turmas geradas com sucesso!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// EDITAR CLASSE INTEIRA (Ajustada)
app.put('/admin/turmas/GRUPO/editar', async (req, res) => {
    const { nomeAntigo, nome_turma, semestres, periodo } = req.body; 
    try {
        let pool = await sql.connect(dbConfig);
        
        // 1. Atualiza nomes existentes
        await pool.request()
            .input('antigoBusca', sql.VarChar, `${nomeAntigo}%`)
            .input('antigoPuro', sql.VarChar, nomeAntigo)
            .input('novoNome', sql.VarChar, nome_turma)
            .input('per', sql.VarChar, periodo)
            .query(`
                UPDATE Turmas 
                SET nome_turma = REPLACE(nome_turma, @antigoPuro, @novoNome),
                    periodo = @per
                WHERE nome_turma LIKE @antigoBusca
            `);

        // 2. Ajuste de quantidade
        const atuais = await pool.request()
            .input('base', sql.VarChar, `${nome_turma}%`)
            .query("SELECT * FROM Turmas WHERE nome_turma LIKE @base ORDER BY id ASC");

        const qtdAtual = atuais.recordset.length;
        const novaQtd = parseInt(semestres);

        if (novaQtd > qtdAtual) {
            for (let i = qtdAtual + 1; i <= novaQtd; i++) {
                await pool.request()
                    .input('n', sql.VarChar, `${nome_turma} - ${i}° Período`)
                    .input('p', sql.VarChar, periodo)
                    .query("INSERT INTO Turmas (nome_turma, periodo) VALUES (@n, @p)");
            }
        } else if (novaQtd < qtdAtual) {
            const IDsParaRemover = atuais.recordset.slice(novaQtd).map(t => t.id);
            for (let id of IDsParaRemover) {
                await pool.request().input('id', sql.Int, id).query("DELETE FROM Turmas WHERE id = @id");
            }
        }
        res.json({ success: true, message: "Classe atualizada!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE CLASSE INTEIRA (Blindada contra erro de FK)
app.post('/admin/turmas/GRUPO/deletar', async (req, res) => {
    const { nomeBase } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        
        // 1. "Solta" os usuários: quem estiver vinculado a turmas desse curso fica com id_turma = NULL
        // Usamos uma subquery para achar todos os IDs de turmas que começam com o nome da classe
        await pool.request()
            .input('base', sql.VarChar, `${nomeBase}%`)
            .query(`
                UPDATE Usuarios 
                SET id_turma = NULL 
                WHERE id_turma IN (SELECT id FROM Turmas WHERE nome_turma LIKE @base)
            `);

        // 2. Apaga vínculos de professores na tabela de relação
        // Isso resolve o erro de conflito que restava
        await pool.request()
            .input('base', sql.VarChar, `${nomeBase}%`)
            .query(`
                DELETE FROM Professor_Turmas 
                WHERE id_turma IN (SELECT id FROM Turmas WHERE nome_turma LIKE @base)
            `);

        // 3. Agora, com a casa limpa, apaga as turmas de fato
        await pool.request()
            .input('base', sql.VarChar, `${nomeBase}%`)
            .query("DELETE FROM Turmas WHERE nome_turma LIKE @base");
        
        res.json({ success: true, message: "Classe e vínculos removidos com sucesso!" });
    } catch (err) {
        console.error("Erro fatal ao deletar classe:", err.message);
        res.status(500).json({ success: false, message: "Não foi possível excluir. Verifique se existem dependências ativas." });
    }
});

// EDIÇÃO INDIVIDUAL DE TURMA
app.put('/admin/turmas/:id', async (req, res) => {
    const { id } = req.params;
    const { nome_turma, periodo } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.VarChar, nome_turma)
            .input('periodo', sql.VarChar, periodo)
            .query("UPDATE Turmas SET nome_turma = @nome, periodo = @periodo WHERE id = @id");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// EXCLUSÃO INDIVIDUAL DE TURMA
app.delete('/admin/turmas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        let pool = await sql.connect(dbConfig);
        // Primeiro coloca o usuário como NULL
        await pool.request().input('id', sql.Int, id).query("UPDATE Usuarios SET id_turma = NULL WHERE id_turma = @id");
        // Apaga vínculos de professores
        await pool.request().input('id', sql.Int, id).query("DELETE FROM Professor_Turmas WHERE id_turma = @id");
        // Apaga a turma
        await pool.request().input('id', sql.Int, id).query("DELETE FROM Turmas WHERE id = @id");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- ROTAS DE USUÁRIOS ---

app.get('/admin/usuarios', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        
        // 1. Busca todos os usuários e os dados da turma (se for aluno)
        let result = await pool.request().query(`
            SELECT 
                u.id, u.nome, u.ra, u.senha, u.tipo, u.id_turma,
                t.nome_turma as nome_turma_aluno, 
                t.periodo as turno_aluno
            FROM Usuarios u 
            LEFT JOIN Turmas t ON u.id_turma = t.id
        `);

        let listaRaw = result.recordset;

        // 2. Criamos uma nova lista processada
        const listaProcessada = await Promise.all(listaRaw.map(async (u) => {
            if (u.tipo === 'professor') {
                // Busca as turmas deste professor
                let resTurmas = await pool.request()
                    .input('userId', sql.Int, u.id)
                    .query("SELECT id_turma FROM Professor_Turmas WHERE id_usuario = @userId");
                
                const ids = resTurmas.recordset.map(r => r.id_turma);
                
                return {
                    ...u,
                    turmas_ids: ids,
                    nome_turma: ids.length > 0 ? `Gestor de ${ids.length} turmas` : 'Sem Turmas',
                    turno_usuario: '-'
                };
            } else {
                return {
                    ...u,
                    turmas_ids: [],
                    nome_turma: u.nome_turma_aluno || 'Sem Vínculo',
                    turno_usuario: u.turno_aluno || '-'
                };
            }
        }));

        res.json({ success: true, lista: listaProcessada });
    } catch (err) { 
        res.status(500).json({ success: false, message: err.message }); 
    }
});
app.post('/admin/cadastrar', async (req, res) => {
    const { nome, ra, senha, tipo, id_turma, turmas_professor } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        let transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const request = new sql.Request(transaction);
            // 1. Insere o Usuário e pega o ID gerado
            let result = await request
                .input('nome', sql.VarChar, nome)
                .input('ra', sql.VarChar, ra)
                .input('senha', sql.VarChar, senha)
                .input('tipo', sql.VarChar, tipo)
                .input('id_turma', sql.Int, tipo === 'aluno' ? id_turma : null)
                .query("INSERT INTO Usuarios (nome, ra, senha, tipo, id_turma) OUTPUT INSERTED.id VALUES (@nome, @ra, @senha, @tipo, @id_turma)");
            
            const userId = result.recordset[0].id;

            // 2. Se for Professor, insere os vínculos na tabela Professor_Turmas
            if (tipo === 'professor' && Array.isArray(turmas_professor) && turmas_professor.length > 0) {
                for (let tId of turmas_professor) {
                    await new sql.Request(transaction)
                        .input('u', sql.Int, userId)
                        .input('t', sql.Int, tId)
                        .query("INSERT INTO Professor_Turmas (id_usuario, id_turma) VALUES (@u, @t)");
                }
            }

            await transaction.commit();
            res.json({ success: true, message: "Cadastrado com sucesso!" });
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    } catch (err) { 
        console.error(err.message);
        res.status(500).json({ success: false, message: err.message }); 
    }
});

app.put('/admin/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, ra, senha, tipo, id_turma, turmas_professor } = req.body; // turmas_professor deve ser um array de IDs
    try {
        let pool = await sql.connect(dbConfig);
        let transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const request = new sql.Request(transaction);
            request.input('id', sql.Int, id)
                   .input('nome', sql.VarChar, nome)
                   .input('ra', sql.VarChar, ra)
                   .input('tipo', sql.VarChar, tipo)
                   .input('id_turma', sql.Int, tipo === 'aluno' ? id_turma : null);

            // 1. Atualiza Usuário
            await request.query("UPDATE Usuarios SET nome=@nome, ra=@ra, tipo=@tipo, id_turma=@id_turma WHERE id=@id");

            // 2. Se for Professor, gerencia os vínculos
            if (tipo === 'professor') {
                // Apaga tudo o que ele tinha
                await new sql.Request(transaction).input('u', sql.Int, id).query("DELETE FROM Professor_Turmas WHERE id_usuario = @u");
                
                // Insere os novos vínculos selecionados no App
                if (turmas_professor && turmas_professor.length > 0) {
                    for (let tId of turmas_professor) {
                        await new sql.Request(transaction)
                            .input('u', sql.Int, id)
                            .input('t', sql.Int, tId)
                            .query("INSERT INTO Professor_Turmas (id_usuario, id_turma) VALUES (@u, @t)");
                    }
                }
            }
            await transaction.commit();
            res.json({ success: true });
        } catch (e) { await transaction.rollback(); throw e; }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/admin/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request().input('id', sql.Int, id).query("DELETE FROM Professor_Turmas WHERE id_usuario = @id");
        await pool.request().input('id', sql.Int, id).query("DELETE FROM Usuarios WHERE id = @id");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/login', async (req, res) => {
    const { ra, senha, tipo } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().input('ra', sql.VarChar, ra).input('senha', sql.VarChar, senha).input('tipo', sql.VarChar, tipo).query("SELECT id, nome, ra, tipo FROM Usuarios WHERE ra = @ra AND senha = @senha AND tipo = @tipo");
        if (result.recordset.length > 0) res.json({ success: true, user: result.recordset[0] });
        else res.json({ success: false, message: "RA ou Senha incorretos!" });
    } catch (err) { res.status(500).json({ success: false }); }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 Servidor UniCheck ativo na porta ${PORT}`); });