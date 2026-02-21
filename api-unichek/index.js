const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const dbConfig = {
    user: 'sa', 
    password: 'Allan@2612', 
    server: 'DESKTOP-ALLAN', 
    database: 'Unichek', 
    options: { encrypt: true, trustServerCertificate: true }
};

// --- ROTA DE TESTE (Adicionada novamente) ---
app.get('/teste', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        res.send("✅ Servidor UniCheck e Banco de Dados conectados!");
    } catch (err) {
        res.status(500).send("❌ Erro na conexão: " + err.message);
    }
});

// --- ROTA LOGIN PROFESSOR (Para o Renan) ---
app.post('/login/professor', async (req, res) => {
    const { cpf, senha } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('cpf', sql.VarChar, cpf)
            .input('senha', sql.VarChar, senha)
            .query("SELECT Nome FROM Usuarios WHERE CPF = @cpf AND Senha = @senha AND Tipo = 'Professor'");
        if (result.recordset.length > 0) res.json({ success: true, nome: result.recordset[0].Nome });
        else res.status(401).json({ success: false, message: "Acesso negado para professores." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ROTA LOGIN ALUNO (Para a Giu) ---
app.post('/login/aluno', async (req, res) => {
    const { cpf, senha } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('cpf', sql.VarChar, cpf)
            .input('senha', sql.VarChar, senha)
            .query("SELECT Nome FROM Usuarios WHERE CPF = @cpf AND Senha = @senha AND Tipo = 'Aluno'");
        if (result.recordset.length > 0) res.json({ success: true, nome: result.recordset[0].Nome });
        else res.status(401).json({ success: false, message: "Acesso negado para alunos." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ROTA LOGIN ADMIN (Para o Allan) ---
app.post('/login/admin', async (req, res) => {
    const { cpf, senha } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('cpf', sql.VarChar, cpf)
            .input('senha', sql.VarChar, senha)
            .query("SELECT Nome FROM Usuarios WHERE CPF = @cpf AND Senha = @senha AND Tipo = 'Admin'");
        if (result.recordset.length > 0) res.json({ success: true, nome: result.recordset[0].Nome });
        else res.status(401).json({ success: false, message: "Acesso negado. Apenas administradores." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(3000, () => console.log("Servidor UniCheck rodando na porta 3000"));