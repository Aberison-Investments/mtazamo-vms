<?php

namespace App\Support;

class SeatRoles
{
    private static array $chains = [
        'president' => ['national', 'county', 'constituency', 'ward', 'agent', 'volunteer'],
        'governor'  => ['county', 'constituency', 'ward', 'agent', 'volunteer'],
        'senator'   => ['county', 'constituency', 'ward', 'agent', 'volunteer'],
        'mp'        => ['constituency', 'ward', 'agent', 'volunteer'],
        'mca'       => ['constituency', 'ward', 'agent', 'volunteer'],
    ];

    private static array $formLetters = [
        'president' => '34',
        'governor'  => '37',
        'senator'   => '38',
        'mp'        => '35',
        'mca'       => '36',
    ];

    public static function rolesForSeat(string $seat): array
    {
        return self::$chains[$seat] ?? self::$chains['governor'];
    }

    public static function formLetter(string $seat): string
    {
        return self::$formLetters[$seat] ?? '37';
    }

    public static function roleBlurb(string $role, string $seat): string
    {
        $l = self::formLetter($seat);
        $seatName = ucfirst($seat);

        return match ($role) {
            'agent'        => "Sits at one polling station on election day. Captures Form {$l}A and submits via the app.",
            'ward'         => "Sees every station in the ward. Verifies or queries Form {$l}A submissions.",
            'constituency' => "Reconciles the constituency tallying centre. Form {$l}B reconciliation.",
            'county'       => "Top of the {$seatName} chain. Form {$l}C reconciliation across all constituencies.",
            'national'     => "Sits at the national tallying centre. Form 34D reconciliation. Presidential chain only.",
            'volunteer'    => "Mobilisation support. No station assignment, no verification rights.",
            default        => '',
        };
    }

    public static function geoLevel(string $role): string
    {
        return match ($role) {
            'agent'        => 'station',
            'ward'         => 'ward',
            'constituency' => 'constituency',
            'county'       => 'county',
            'national'     => 'national',
            default        => 'ward',
        };
    }

    public static function roleLabel(string $role): string
    {
        return match ($role) {
            'agent'        => 'Polling agent',
            'ward'         => 'Ward admin',
            'constituency' => 'Constituency agent',
            'county'       => 'County agent',
            'national'     => 'National agent',
            'volunteer'    => 'Volunteer',
            default        => ucfirst($role),
        };
    }
}
