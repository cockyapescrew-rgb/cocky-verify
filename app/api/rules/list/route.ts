import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

function sortRequirements(requirements: any[]) {
  return [...(requirements || [])].sort((a, b) => {
    const groupA = Number(a.group_id || 999999);
    const groupB = Number(b.group_id || 999999);

    if (groupA !== groupB) return groupA - groupB;

    const createdA = String(a.created_at || "");
    const createdB = String(b.created_at || "");

    return createdA.localeCompare(createdB);
  });
}

function addRequirementGroups(rule: any) {
  const requirements = sortRequirements(rule.role_rule_requirements || []);
  const groupsMap = new Map<number, any[]>();

  requirements.forEach((req, index) => {
    // Backwards compatible:
    // Old requirements may not have group_id. Treat each old requirement
    // as its own OR group.
    const groupId = Number(req.group_id || index + 1);

    if (!groupsMap.has(groupId)) {
      groupsMap.set(groupId, []);
    }

    groupsMap.get(groupId)!.push({
      ...req,
      group_id: groupId,
      group_operator: req.group_operator || "AND",
    });
  });

  const requirement_groups = Array.from(groupsMap.entries())
    .map(([group_id, group_requirements]) => ({
      group_id,
      group_operator: "AND",
      requirements: group_requirements,
    }))
    .sort((a, b) => a.group_id - b.group_id);

  return {
    ...rule,
    role_rule_requirements: requirements,
    requirement_groups,
    rule_logic: "OR_GROUPS_AND_INSIDE",
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");

  if (!projectId) {
    return NextResponse.json(
      { success: false, error: "Missing project_id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("role_rules")
    .select(
      `
      *,
      role_rule_requirements (*)
    `
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    rules: (data || []).map(addRequirementGroups),
  });
}
