import type { ScriptVarTypeId } from "@august/osrs-engine/config/db/ScriptVarType";

export type DbColumnDefinition = {
    columnId: number;
    types: ScriptVarTypeId[];
    defaultValues?: any[];
};

export class DbTableDefinition {
    readonly columns = new Map<number, DbColumnDefinition>();

    constructor(readonly id: number) {}

    setColumn(def: DbColumnDefinition) {
        this.columns.set(def.columnId, def);
    }

    getColumn(columnId: number): DbColumnDefinition | undefined {
        return this.columns.get(columnId);
    }
}
