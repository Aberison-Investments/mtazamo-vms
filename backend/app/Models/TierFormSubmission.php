<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TierFormSubmission extends Model
{
    protected $table = 'tier_form_submissions';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'run_id', 'workspace_id', 'tier_level', 'geo_id',
        'submitted_by_user_id',
        'candidate_data',
        'total_valid_form', 'total_valid_platform',
        'rejected_ballots_form', 'rejected_ballots_platform',
        'discrepancy_flags', 'has_discrepancy',
        'form_image_paths',
        'status', 'submitted_at',
    ];

    protected $casts = [
        'candidate_data'     => 'array',
        'discrepancy_flags'  => 'array',
        'form_image_paths'   => 'array',
        'has_discrepancy'    => 'boolean',
        'submitted_at'       => 'datetime',
    ];
}
