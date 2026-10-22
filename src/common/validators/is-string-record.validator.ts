import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export function IsStringRecord(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isStringRecord',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

          const entries = Object.entries(value);

          return entries.length > 0 && entries.every(([, entry]) => typeof entry === 'string');
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a non-empty object of string values`;
        },
      },
    });
  };
}
