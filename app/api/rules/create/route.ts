import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

type Requirement = {
  requirement_type: string;
  issuer?: string;
  taxon?: string;
  min_nft_count?: number;
  trait_type?: string;
  trait_value?: string;
  token_currency?: string;
  token_issuer?: string;
  min_token_amount?: number;

  // New grouped logic:
  // OR happens between groups.
  // AND happens inside each group.
  group_id?: number;
  group_operator?: "AND";

  // Keep old field for backwards compatibility.
  logic?: string;
};

function isTokenRequirementType(type: string) {
  return ["token_count", "token_quantity", "token"].includes(
    String(type || "").trim()
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      project_id,
      discord_role_id,
      role_name,
      requirements = [],
    }: {
      project_id: string;
      discord_role_id: string;
      role_name: string;
      requirements: Requirement[];
    } = body;

    if (!project_id || !discord_role_id || !role_name) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing project_id, discord_role_id, or role_name",
        },
        { status: 400 }
      );
    }

    if (!requirements.length) {
      return NextResponse.json(
        { success: false, error: "At least one requirement is required" },
        { status: 400 }
      );
    }

    const cleanedRequirements = requirements.filter((req) => {
      const type = String(req.requirement_type || "").trim();

      if (!type) return false;

      if (isTokenRequirementType(type)) {
        // Currency is optional. Issuer + min amount is enough.
        return Boolean(req.token_issuer);
      }

      return Boolean(req.issuer);
    });

    if (!cleanedRequirements.length) {
      return NextResponse.json(
        { success: false, error: "No valid requirements were provided." },
        { status: 400 }
      );
    }

    const { data: rule, error: ruleError } = await supabase
      .from("role_rules")
      .insert({
        project_id,
        discord_role_id,
        role_name,
        rule_type: "multi_requirement",
      })
      .select()
      .single();

    if (ruleError || !rule) {
      return NextResponse.json(
        {
          success: false,
          error: ruleError?.message || "Failed to create role rule",
        },
        { status: 500 }
      );
    }

    const requirementRows = cleanedRequirements.map((req, index) => {
      // Backwards compatible:
      // If the frontend does not send group_id yet, each requirement becomes
      // its own group. That preserves current OR behavior.
      const groupId =
        Number(req.group_id || 0) > 0 ? Number(req.group_id) : index + 1;

      return {
        role_rule_id: rule.id,
        requirement_type: req.requirement_type,
        issuer: isTokenRequirementType(req.requirement_type) ? null : req.issuer || null,
        taxon: isTokenRequirementType(req.requirement_type) ? null : req.taxon || null,
        min_nft_count: req.min_nft_count || 1,
        trait_type: isTokenRequirementType(req.requirement_type) ? null : req.trait_type || null,
        trait_value: isTokenRequirementType(req.requirement_type) ? null : req.trait_value || null,
        token_currency: req.token_currency || null,
        token_issuer: req.token_issuer || null,
        min_token_amount:
          req.min_token_amount === undefined || req.min_token_amount === null
            ? null
            : Number(req.min_token_amount),

        // Existing field stays OR so old display/logic does not break.
        logic: req.logic || "OR",

        // New grouped logic.
        group_id: groupId,
        group_operator: "AND",
      };
    });

    const { data: savedRequirements, error: reqError } = await supabase
      .from("role_rule_requirements")
      .insert(requirementRows)
      .select();

    if (reqError) {
      return NextResponse.json(
        { success: false, error: reqError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      rule,
      requirements: savedRequirements,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "Failed to create rule" },
      { status: 500 }
    );
  }
}
