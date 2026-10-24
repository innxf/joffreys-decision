/**
 * variable-system.js - 三级变量系统
 * 
 * 封装 turn/session/global 三级变量，支持回滚和导出。
 * Phase 1 即启用，与 gameData 共存。
 * 
 * turn:    当前回合（重新生成时回滚）
 * session: 当前存档（= gameData，跨回合持久）
 * global:  全局设置（跨存档持久）
 * 
 * 读取优先级：turn → session → global
 * 
 * 依赖：无
 */

var variableSystem = (function() {
    var turnVars = new Map();
    var sessionVars = new Map();
    var globalVars = new Map();
    var _preCommitSnapshot = null;  // commitTurn 前的 session 快照，用于回滚

    // Values cross the variable boundary by copy. Mutations require set().
    function copy(value) { return value === undefined ? undefined : structuredClone(value); }

    function init(initialSession) {
        _preCommitSnapshot = null;
        turnVars.clear();
        sessionVars.clear();
        if (initialSession) {
            Object.keys(initialSession).forEach(function(k) {
                sessionVars.set(k, copy(initialSession[k]));
            });
        }
    }

    function get(key) {
        if (turnVars.has(key)) return copy(turnVars.get(key));
        if (sessionVars.has(key)) return copy(sessionVars.get(key));
        return copy(globalVars.get(key));
    }

    function set(key, value, scope) {
        if (scope === undefined) scope = 'turn';
        if (scope === 'turn') turnVars.set(key, copy(value));
        else if (scope === 'session') sessionVars.set(key, copy(value));
        else if (scope === 'global') globalVars.set(key, copy(value));
    }

    function commitTurn() {
        // 保存 commit 前的 session 快照，供回滚使用
        _preCommitSnapshot = {};
        sessionVars.forEach(function(v, k) { _preCommitSnapshot[k] = copy(v); });
        turnVars.forEach(function(v, k) { sessionVars.set(k, copy(v)); });
        turnVars.clear();
    }

    function rollbackTurn() {
        turnVars.clear();
        // 如果 commit 已执行，从快照恢复 session
        if (_preCommitSnapshot) {
            sessionVars.clear();
            Object.keys(_preCommitSnapshot).forEach(function(k) {
                sessionVars.set(k, copy(_preCommitSnapshot[k]));
            });
            _preCommitSnapshot = null;
        }
    }

    function hasTurnPending() {
        return turnVars.size > 0;
    }

    function canRollback() {
        return turnVars.size > 0 || _preCommitSnapshot !== null;
    }

    function exportSession() {
        var result = {};
        sessionVars.forEach(function(v, k) { result[k] = copy(v); });
        return result;
    }

    function importSession(snapshot) {
        _preCommitSnapshot = null;
        sessionVars.clear();
        if (snapshot) {
            Object.keys(snapshot).forEach(function(k) {
                sessionVars.set(k, copy(snapshot[k]));
            });
        }
        turnVars.clear();
    }

    function toTemplateVars() {
        var merged = {};
        globalVars.forEach(function(v, k) { merged[k] = copy(v); });
        sessionVars.forEach(function(v, k) { merged[k] = copy(v); });
        turnVars.forEach(function(v, k) { merged[k] = copy(v); });
        return merged;
    }

    return {
        init: init,
        get: get,
        set: set,
        commitTurn: commitTurn,
        rollbackTurn: rollbackTurn,
        hasTurnPending: hasTurnPending,
        canRollback: canRollback,
        exportSession: exportSession,
        importSession: importSession,
        toTemplateVars: toTemplateVars
    };
})();
